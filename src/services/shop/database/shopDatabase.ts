/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop Standalone Database Engine
 * Completely decoupled from Tumpang Food and other services.
 * Manages all Shop marketplace state, products, categories, orders, shipments, and migrations.
 */

import fs from 'fs';
import path from 'path';
import { 
  ShopProduct, ShopCategory, ShopOrder, ShopConfig, ShopAuditLog,
  ShopPaymentStatus, ShopOrderStatus, ShopOrderItem,
  ShopShipment, ShopTrackingEvent, ShopShipmentStatus, ShopShipmentScope
} from '../../../types/shop';
import { courierRegistry } from '../shipping/courierAdapters';
import { shopEnv } from '../config/shopEnv';
import { ShopDatabaseSchema, ShopSchemaValidator } from './shopSchema';
import { ShopMigrationRunner } from './shopMigration';
import { 
  safeAdminSetDoc, safeAdminDeleteDoc, safeAdminGetDoc, 
  safeAdminGetDocs, isFirestoreAdminConfigured,
  testFirestoreConnection
} from '../../../server/firebaseAdmin';

const SHOP_DB_FILE = shopEnv.database.filePath;

export class ShopDatabase {
  private schema: ShopDatabaseSchema = {
    config: {
      id: 'shop_config_default',
      storeName: shopEnv.defaults.storeName,
      storeAddress: shopEnv.defaults.storeAddress,
      storePhone: shopEnv.defaults.storePhone,
      isOpen: shopEnv.defaults.isOpen,
      qrisImage: shopEnv.defaults.qrisImage,
      defaultDeliveryFee: shopEnv.defaults.defaultDeliveryFee,
      serviceFee: shopEnv.defaults.serviceFee,
      minOrderAmount: shopEnv.defaults.minOrderAmount,
      updatedAt: new Date().toISOString()
    },
    categories: [],
    products: [],
    orders: [],
    shipments: [],
    auditLogs: [],
    migrations: []
  };

  private isInitialized = false;
  private isCloudSyncing = false;
  private migrationRunner = new ShopMigrationRunner();
  private idempotencyCache: Map<string, { orderId: string; timestamp: number }> = new Map();
  private recentOrderFingerprints: Map<string, { orderId: string; timestamp: number }> = new Map();

  constructor() {
    this.loadFromLocal();
  }

  /**
   * Load state from local JSON file
   */
  private loadFromLocal() {
    try {
      if (fs.existsSync(SHOP_DB_FILE)) {
        const raw = fs.readFileSync(SHOP_DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.schema = {
            config: parsed.config || this.schema.config,
            categories: Array.isArray(parsed.categories) ? parsed.categories : [],
            products: Array.isArray(parsed.products) ? parsed.products : [],
            orders: Array.isArray(parsed.orders) ? parsed.orders : [],
            shipments: Array.isArray(parsed.shipments) ? parsed.shipments : [],
            auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
            migrations: Array.isArray(parsed.migrations) ? parsed.migrations : []
          };
        }
      }
    } catch (err: any) {
      console.warn('[ShopDatabase] Gagal membaca database lokal shop, menggunakan state default:', err?.message || err);
    }
  }

  /**
   * Atomic local persistence
   */
  private persistToLocal() {
    try {
      const dir = path.dirname(SHOP_DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tempPath = `${SHOP_DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(this.schema, null, 2), 'utf-8');
      fs.renameSync(tempPath, SHOP_DB_FILE);
    } catch (err: any) {
      console.error('[ShopDatabase] Gagal menyimpan ke file lokal:', err?.message || err);
    }
  }

  /**
   * Create non-destructive backup
   */
  public createBackup(): string {
    const backupPath = `${SHOP_DB_FILE}.backup_${Date.now()}.json`;
    try {
      if (fs.existsSync(SHOP_DB_FILE)) {
        fs.copyFileSync(SHOP_DB_FILE, backupPath);
      }
    } catch (e) {
      console.warn('[ShopDatabase] Backup warning:', e);
    }
    return backupPath;
  }

  /**
   * Ensure database is initialized, migrated, and synced
   */
  public async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Run automatic migrations & schema audit
      const { updatedDb, result } = await this.migrationRunner.runMigrations(this.schema);
      this.schema = updatedDb;
      this.persistToLocal();
      if (result.appliedCount > 0) {
        console.log(`[ShopDatabase] Migrasi database diterapkan: ${result.message}`);
      }

      // Check Firestore Cloud Sync if enabled
      if (shopEnv.database.enableCloudSync && isFirestoreAdminConfigured()) {
        await this.syncFromCloud();
      }

      this.isInitialized = true;
    } catch (err: any) {
      console.warn('[ShopDatabase Init Error]', err?.message || err);
      this.isInitialized = true; // Fallback to local memory/file
    }
  }

  private async syncFromCloud() {
    try {
      if (!isFirestoreAdminConfigured()) return;

      const pfx = shopEnv.database.firestoreCollectionPrefix;
      const [cfgDoc, catDocs, prodDocs, ordDocs, shipDocs] = await Promise.all([
        safeAdminGetDoc(`${pfx}config`, 'shop_config_default'),
        safeAdminGetDocs(`${pfx}categories`),
        safeAdminGetDocs(`${pfx}products`),
        safeAdminGetDocs(`${pfx}orders`),
        safeAdminGetDocs(`${pfx}shipments`)
      ]);

      if (cfgDoc) {
        this.schema.config = { ...this.schema.config, ...cfgDoc };
      }
      if (catDocs && catDocs.length > 0) {
        this.schema.categories = catDocs as ShopCategory[];
      }
      if (prodDocs && prodDocs.length > 0) {
        this.schema.products = prodDocs as ShopProduct[];
      }
      if (ordDocs && ordDocs.length > 0) {
        this.schema.orders = ordDocs as ShopOrder[];
      }
      if (shipDocs && shipDocs.length > 0) {
        this.schema.shipments = shipDocs as ShopShipment[];
      }

      this.persistToLocal();
    } catch (err: any) {
      console.warn('[ShopDatabase Cloud Sync Warning]', err?.message || err);
    }
  }

  /**
   * Health & storage status for Shop service
   */
  public async getStorageStatus(): Promise<{
    service: string;
    databaseType: string;
    filePath: string;
    liveCloudConnected: boolean;
    storageMode: string;
    totalCategories: number;
    totalProducts: number;
    totalOrders: number;
    totalShipments: number;
    diagnosticReason?: string;
    timestamp: string;
  }> {
    const cloudCheck = await testFirestoreConnection();
    const isCloud = cloudCheck.connected;

    return {
      service: 'tumpang-shop',
      databaseType: shopEnv.database.type,
      filePath: SHOP_DB_FILE,
      liveCloudConnected: isCloud,
      storageMode: isCloud ? 'cloud_firestore_primary' : 'isolated_local_database_resilient',
      totalCategories: this.schema.categories.length,
      totalProducts: this.schema.products.length,
      totalOrders: this.schema.orders.length,
      totalShipments: this.schema.shipments.length,
      diagnosticReason: cloudCheck.diagnosticReason,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Audit logging
   */
  public logAudit(action: string, details: string, actor: string = 'system') {
    const log: ShopAuditLog = {
      id: `slog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      action,
      details,
      actor,
      timestamp: new Date().toISOString()
    };
    this.schema.auditLogs.unshift(log);
    if (this.schema.auditLogs.length > 500) {
      this.schema.auditLogs = this.schema.auditLogs.slice(0, 500);
    }
    this.persistToLocal();
  }

  // --- CONFIG ---
  public getConfig(): ShopConfig {
    return { ...this.schema.config };
  }

  public async updateConfig(actor: string, updates: Partial<ShopConfig>): Promise<ShopConfig> {
    this.schema.config = {
      ...this.schema.config,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.persistToLocal();
    this.logAudit('UPDATE_SHOP_CONFIG', `Pembaruan konfigurasi toko oleh ${actor}`, actor);

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await safeAdminSetDoc(`${pfx}config`, 'shop_config_default', this.schema.config);
    } catch {}

    return this.getConfig();
  }

  // --- CATEGORIES ---
  public getCategories(): ShopCategory[] {
    return [...this.schema.categories].sort((a, b) => a.orderIndex - b.orderIndex);
  }

  public getCategoryById(id: string): ShopCategory | undefined {
    return this.schema.categories.find(c => c.id === id);
  }

  public async createCategory(actor: string, data: Partial<ShopCategory>): Promise<ShopCategory> {
    const val = ShopSchemaValidator.validateCategory(data);
    if (!val.isValid) throw new Error(val.error);

    const now = new Date().toISOString();
    const newCategory: ShopCategory = {
      id: `scat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: data.name!.trim(),
      slug: data.slug || data.name!.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: data.description || '',
      icon: data.icon || 'Package',
      orderIndex: data.orderIndex !== undefined ? data.orderIndex : this.schema.categories.length + 1,
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: now,
      updatedAt: now
    };

    this.schema.categories.push(newCategory);
    this.persistToLocal();
    this.logAudit('CREATE_CATEGORY', `Kategori ${newCategory.name} dibuat oleh ${actor}`, actor);

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await safeAdminSetDoc(`${pfx}categories`, newCategory.id, newCategory);
    } catch {}

    return newCategory;
  }

  public async updateCategory(actor: string, id: string, updates: Partial<ShopCategory>): Promise<ShopCategory> {
    const index = this.schema.categories.findIndex(c => c.id === id);
    if (index === -1) throw new Error(`Kategori ${id} tidak ditemukan.`);

    const updated = {
      ...this.schema.categories[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.schema.categories[index] = updated;
    this.persistToLocal();
    this.logAudit('UPDATE_CATEGORY', `Kategori ${updated.name} (${id}) diperbarui oleh ${actor}`, actor);

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await safeAdminSetDoc(`${pfx}categories`, id, updated);
    } catch {}

    return updated;
  }

  public async deleteCategory(actor: string, id: string): Promise<boolean> {
    const index = this.schema.categories.findIndex(c => c.id === id);
    if (index === -1) return false;

    const [deleted] = this.schema.categories.splice(index, 1);
    this.persistToLocal();
    this.logAudit('DELETE_CATEGORY', `Kategori ${deleted.name} (${id}) dihapus oleh ${actor}`, actor);

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await safeAdminDeleteDoc(`${pfx}categories`, id);
    } catch {}

    return true;
  }

  // --- PRODUCTS ---
  public getProducts(filter?: { categoryId?: string; search?: string; onlyActive?: boolean }): ShopProduct[] {
    let prods = [...this.schema.products];
    if (filter?.onlyActive !== false) {
      prods = prods.filter(p => p.isActive);
    }
    if (filter?.categoryId) {
      prods = prods.filter(p => p.categoryId === filter.categoryId);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      prods = prods.filter(p => p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)) || (p.sku && p.sku.toLowerCase().includes(q)));
    }
    return prods;
  }

  public getProductById(id: string): ShopProduct | undefined {
    return this.schema.products.find(p => p.id === id);
  }

  public async createProduct(actor: string, data: Partial<ShopProduct>): Promise<ShopProduct> {
    const val = ShopSchemaValidator.validateProduct(data);
    if (!val.isValid) throw new Error(val.error);

    const now = new Date().toISOString();
    const effectivePrice = typeof data.price === 'number' ? data.price : typeof (data as any).basePrice === 'number' ? (data as any).basePrice : 0;
    const newProduct: any = {
      id: `sprod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sku: data.sku || `TS-${Date.now().toString().slice(-6)}`,
      name: data.name!.trim(),
      description: data.description || '',
      price: Math.round(effectivePrice),
      basePrice: Math.round(effectivePrice),
      originalPrice: data.originalPrice,
      stock: data.stock !== undefined ? data.stock : 100,
      unit: data.unit || 'pcs',
      categoryId: data.categoryId!,
      image: data.image || (Array.isArray(data.images) && data.images[0]) || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80',
      images: data.images || (data.image ? [data.image] : []),
      isActive: data.isActive !== undefined ? data.isActive : true,
      isFeatured: data.isFeatured || false,
      minOrder: data.minOrder || 1,
      variants: data.variants || [],
      variations: (data as any).variations || [],
      createdAt: now,
      updatedAt: now
    };

    this.schema.products.push(newProduct);
    this.persistToLocal();
    this.logAudit('CREATE_PRODUCT', `Produk ${newProduct.name} (${newProduct.sku}) dibuat oleh ${actor}`, actor);

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await safeAdminSetDoc(`${pfx}products`, newProduct.id, newProduct);
    } catch {}

    return newProduct;
  }

  public async updateProduct(actor: string, id: string, updates: any): Promise<ShopProduct> {
    const index = this.schema.products.findIndex(p => p.id === id);
    if (index === -1) throw new Error(`Produk ${id} tidak ditemukan.`);

    const current = this.schema.products[index];
    const effectivePrice = typeof updates.price === 'number' ? updates.price : typeof updates.basePrice === 'number' ? updates.basePrice : current.price;
    const updated: any = {
      ...current,
      ...updates,
      id: current.id,
      price: Math.round(effectivePrice),
      basePrice: Math.round(effectivePrice),
      stock: updates.stock !== undefined ? updates.stock : current.stock,
      updatedAt: new Date().toISOString()
    };

    this.schema.products[index] = updated;
    this.persistToLocal();
    this.logAudit('UPDATE_PRODUCT', `Produk ${updated.name} (${id}) diperbarui oleh ${actor}`, actor);

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await safeAdminSetDoc(`${pfx}products`, id, updated);
    } catch {}

    return updated;
  }

  public async deleteProduct(actor: string, id: string): Promise<boolean> {
    const index = this.schema.products.findIndex(p => p.id === id);
    if (index === -1) return false;

    const [deleted] = this.schema.products.splice(index, 1);
    this.persistToLocal();
    this.logAudit('DELETE_PRODUCT', `Produk ${deleted.name} (${id}) dihapus oleh ${actor}`, actor);

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await safeAdminDeleteDoc(`${pfx}products`, id);
    } catch {}

    return true;
  }

  // --- ORDERS ---
  public async createOrder(input: any): Promise<ShopOrder> {
    if (!this.schema.config.isOpen) {
      throw new Error('Layanan Tumpang Shop saat ini sedang tutup. Silakan coba kembali saat toko dibuka.');
    }
    if (!input.customerName || input.customerName.trim().length === 0) {
      throw new Error('Nama pemesan wajib diisi.');
    }
    if (!input.customerPhone || input.customerPhone.trim().length === 0) {
      throw new Error('Nomor telepon / WhatsApp pemesan wajib diisi.');
    }
    const cleanPhone = input.customerPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 8) {
      throw new Error('Nomor WhatsApp tidak valid. Masukkan minimal 8 digit angka.');
    }
    const deliveryAddress = (input.deliveryAddress || input.customerAddress || '').trim();
    if (!deliveryAddress) {
      throw new Error('Alamat pengantaran belanja wajib diisi.');
    }
    const customerDistrict = (input.customerDistrict || 'Kecamatan Tumpang').trim();
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('Keranjang belanja kosong. Pilih minimal 1 produk.');
    }

    // 1. Client Request ID / Idempotency Check
    const reqId = (input.clientRequestId || input.idempotencyKey || '').trim();
    if (reqId) {
      const existingReq = this.schema.orders.find(o => o.clientRequestId === reqId || (o as any).idempotencyKey === reqId);
      if (existingReq) {
        return existingReq;
      }
    }

    // 2. Recent Duplicate Window (15 seconds)
    const recentWindow = new Date(Date.now() - 15000).toISOString();
    const duplicateRecent = this.schema.orders.find(
      o => o.customerPhone.replace(/[^0-9]/g, '') === cleanPhone &&
        o.createdAt >= recentWindow &&
        o.items.length === input.items.length &&
        o.items.every((it, idx) => it.productId === input.items[idx]?.productId && it.quantity === input.items[idx]?.quantity)
    );
    if (duplicateRecent) {
      return duplicateRecent;
    }

    // 3. Item Validation, Pricing, and Stock Check
    const validatedItems: ShopOrderItem[] = [];
    let subtotal = 0;

    for (const itemInput of input.items) {
      if (!itemInput.productId || !itemInput.quantity || itemInput.quantity < 1) {
        throw new Error('Kuantitas produk tidak valid.');
      }
      const product = this.schema.products.find(p => p.id === itemInput.productId);
      if (!product) {
        throw new Error(`Produk dengan ID "${itemInput.productId}" tidak ditemukan.`);
      }
      if (!product.isActive) {
        throw new Error(`Produk "${product.name}" sedang tidak aktif atau tidak tersedia.`);
      }

      let unitPrice = product.price;
      let selectedVariation: any = undefined;

      const variationId = itemInput.variationId || itemInput.variantId;
      const optionId = itemInput.optionId;

      if (variationId && product.variations) {
        const variation = product.variations.find(v => v.id === variationId);
        if (variation) {
          const option = optionId ? variation.options.find(o => o.id === optionId) : variation.options[0];
          if (option) {
            if (typeof option.stock === 'number' && option.stock < itemInput.quantity) {
              throw new Error(`Stok variasi "${option.name}" untuk produk "${product.name}" tidak mencukupi (Tersisa: ${option.stock}, Diminta: ${itemInput.quantity}).`);
            }
            unitPrice = product.price + (option.priceDelta || 0);
            selectedVariation = {
              variationId: variation.id,
              variationName: variation.name,
              optionId: option.id,
              optionName: option.name
            };
          }
        }
      } else {
        if (product.stock < itemInput.quantity) {
          throw new Error(`Stok untuk produk "${product.name}" tidak mencukupi (Tersisa: ${product.stock}, Diminta: ${itemInput.quantity}).`);
        }
      }

      const itemSubtotal = unitPrice * itemInput.quantity;
      subtotal += itemSubtotal;
      validatedItems.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        selectedVariation,
        price: unitPrice,
        quantity: itemInput.quantity,
        subtotal: itemSubtotal
      });
    }

    const minAmount = this.schema.config.minOrderAmount || 0;
    if (subtotal < minAmount) {
      throw new Error(`Subtotal belanja minimal adalah Rp ${minAmount.toLocaleString('id-ID')}. Subtotal saat ini: Rp ${subtotal.toLocaleString('id-ID')}`);
    }

    // 4. Shipping Calculation
    const method = (input.shippingMethod || input.shippingOption?.code || 'INSTANT').toUpperCase();
    let deliveryFee = input.deliveryFee !== undefined ? Number(input.deliveryFee) : (this.schema.config.defaultDeliveryFee || 4000);
    let shippingMethodLabel = 'Kurir Instan Tumpang Go';

    if (method === 'PICKUP') {
      deliveryFee = 0;
      shippingMethodLabel = 'Ambil Sendiri di Toko (Pickup)';
    } else if (method === 'REGULAR') {
      deliveryFee = input.deliveryFee !== undefined ? Number(input.deliveryFee) : Math.max(0, Math.round((this.schema.config.defaultDeliveryFee || 4000) * 0.7));
      shippingMethodLabel = 'Kurir Reguler Toko (Next-Day)';
    } else if (method === 'EXPEDITION_REGULAR') {
      deliveryFee = input.deliveryFee !== undefined ? Number(input.deliveryFee) : 12000;
      shippingMethodLabel = 'Ekspedisi Domestik Reguler (J&T / JNE)';
    } else if (method === 'CHINA_AIR_EXPRESS') {
      deliveryFee = input.deliveryFee !== undefined ? Number(input.deliveryFee) : 35000;
      shippingMethodLabel = 'China Air Freight Express (7-12 Hari)';
    } else if (method === 'CHINA_SEA_STANDARD') {
      deliveryFee = input.deliveryFee !== undefined ? Number(input.deliveryFee) : 20000;
      shippingMethodLabel = 'China Sea Freight Ekonomis (20-30 Hari)';
    }

    const serviceFee = input.serviceFee !== undefined ? Number(input.serviceFee) : (this.schema.config.serviceFee || 1500);
    const uniqueCode = input.uniqueCode !== undefined ? Number(input.uniqueCode) : Math.floor(100 + Math.random() * 899);
    const total = subtotal + deliveryFee + serviceFee + uniqueCode;

    // Deduct stock
    for (const item of validatedItems) {
      const prod = this.schema.products.find(p => p.id === item.productId);
      if (prod) {
        prod.stock = Math.max(0, prod.stock - item.quantity);
        if (item.selectedVariation && prod.variations) {
          const v = prod.variations.find(v2 => v2.id === item.selectedVariation?.variationId);
          const opt = v?.options.find(o => o.id === item.selectedVariation?.optionId);
          if (opt && typeof opt.stock === 'number') {
            opt.stock = Math.max(0, opt.stock - item.quantity);
          }
        }
        prod.updatedAt = new Date().toISOString();
      }
    }

    const now = new Date();
    const expiryMinutes = shopEnv.defaults.paymentExpiryMinutes || 30;
    const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000).toISOString();
    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '');
    const dailyCount = this.schema.orders.filter(o => o.createdAt && o.createdAt.startsWith(now.toISOString().slice(0, 10))).length + 1;
    const orderNumber = `TS-${datePrefix}-${String(dailyCount).padStart(3, '0')}`;

    const isInternational = method.includes('CHINA') || method.includes('CROSSBORDER') || method === 'INTERNATIONAL';
    const shipmentScope: ShopShipmentScope = isInternational ? 'INTERNATIONAL' : 'LOCAL';
    const courierCode = isInternational ? 'CHINA_ID_CROSSBORDER' : method === 'EXPEDITION_REGULAR' ? 'DOMESTIC_EXPEDITION' : 'TUMPANG_LOCAL';
    const courierName = isInternational ? 'Layanan Impor Cross-Border (China 🇨🇳 → Indonesia 🇮🇩)' : method === 'EXPEDITION_REGULAR' ? 'Ekspedisi Domestik Reguler (J&T / JNE)' : 'Kurir Toko Tumpang Go';
    const trackingPrefix = isInternational ? 'CN-ID' : method === 'EXPEDITION_REGULAR' ? 'TS-EXP' : 'TS-LOC';
    const trackingNumber = `${trackingPrefix}-${datePrefix}-${String(dailyCount).padStart(3, '0')}`;
    const originCountry = isInternational ? 'CN' : 'ID';
    const originCity = isInternational ? 'Gudang Konsolidasi Shenzhen, China' : 'Kecamatan Tumpang, Malang';
    const destinationCountry = 'ID';
    const destinationCity = `${customerDistrict}, Malang`;

    const initialTrackingEvent: ShopTrackingEvent = {
      id: `tevt_${Date.now()}_1`,
      status: ShopShipmentStatus.WAITING_DISPATCH,
      location: originCity,
      description: isInternational 
        ? 'Pesanan impor telah dibuat. Menunggu pengemasan dari gudang konsolidasi China.' 
        : 'Pesanan telah dibuat dan siap dikemas setelah pembayaran diverifikasi.',
      timestamp: now.toISOString()
    };

    const estimatedArrival = isInternational 
      ? method === 'CHINA_SEA_STANDARD' ? '20-30 hari kalender (Estimasi unverified)' : '7-12 hari kerja (Estimasi unverified)'
      : method === 'EXPEDITION_REGULAR' ? '2-3 hari kerja (Estimasi manual unverified)' : method === 'REGULAR' ? '1 hari (Next-day)' : '1-3 jam (Same-day)';

    const initialShipment: ShopShipment = {
      id: `ship_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orderId: `sord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      trackingNumber,
      courierCode,
      courierName,
      serviceName: shippingMethodLabel,
      scope: shipmentScope,
      originCountry,
      originCity,
      destinationCountry,
      destinationCity,
      status: ShopShipmentStatus.WAITING_DISPATCH,
      isEstimateVerified: !isInternational && method !== 'EXPEDITION_REGULAR',
      estimatedArrivalNote: estimatedArrival,
      trackingHistory: [initialTrackingEvent],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    const newOrder: any = {
      id: initialShipment.orderId,
      orderNumber,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      deliveryAddress,
      customerAddress: deliveryAddress,
      customerDistrict,
      shippingMethod: method,
      shippingMethodLabel,
      deliveryNotes: input.deliveryNotes?.trim() || '',
      clientRequestId: reqId || undefined,
      items: validatedItems,
      subtotal,
      deliveryFee,
      serviceFee,
      uniqueCode,
      total,
      paymentStatus: ShopPaymentStatus.UNPAID,
      orderStatus: ShopOrderStatus.NEW,
      paymentExpiresAt: expiresAt,
      shipment: initialShipment,
      shipmentId: initialShipment.id,
      trackingNumber,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    this.schema.orders.unshift(newOrder);
    this.schema.shipments.unshift(initialShipment);

    this.persistToLocal();
    this.logAudit('CREATE_SHOP_ORDER', `Pesanan dibuat: ${newOrder.orderNumber} (Resi: ${trackingNumber}) senilai Rp ${newOrder.total.toLocaleString('id-ID')}`, 'CUSTOMER');

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await Promise.all([
        safeAdminSetDoc(`${pfx}orders`, newOrder.id, newOrder),
        safeAdminSetDoc(`${pfx}shipments`, initialShipment.id, initialShipment)
      ]);
    } catch {}

    return newOrder;
  }

  public async attachShipment(order: ShopOrder) {
    const scope: ShopShipmentScope = order.shippingOption?.scope || 'LOCAL';
    const isInternational = scope === 'INTERNATIONAL';

    const courierCode = order.shippingOption?.courierCode || 'TUMPANG_LOCAL';
    const courierName = order.shippingOption?.courierName || 'Kurir Toko Tumpang Go';
    const serviceName = order.shippingOption?.serviceName || 'Kurir Toko Reguler';

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const trackingPrefix = isInternational ? 'CN-ID' : 'TPG';
    const trackingNumber = `${trackingPrefix}-${dateStr}-${Math.floor(100 + Math.random() * 900)}`;

    const initialHistory: ShopTrackingEvent[] = [
      {
        id: `ev_${Date.now()}_1`,
        status: ShopShipmentStatus.WAITING_DISPATCH,
        location: isInternational ? 'Gudang Asal (China)' : 'Toko Tumpang Shop',
        description: isInternational 
          ? 'Pesanan diterima pemasok internasional, menunggu pengemasan dan jadwal penerbangan ekspor.'
          : 'Pesanan telah masuk ke sistem toko dan menunggu pengemasan produk.',
        timestamp: new Date().toISOString()
      }
    ];

    const shipment: ShopShipment = {
      id: `ship_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orderId: order.id,
      trackingNumber,
      courierCode,
      courierName,
      serviceName,
      scope,
      originCountry: isInternational ? 'CN' : 'ID',
      originCity: isInternational ? 'Shenzhen / Guangzhou, China' : 'Tumpang, Malang',
      destinationCountry: 'ID',
      destinationCity: 'Tumpang, Malang',
      status: ShopShipmentStatus.WAITING_DISPATCH,
      isEstimateVerified: !isInternational,
      estimatedArrivalNote: isInternational 
        ? 'Estimasi belum terverifikasi API live kargo internasional, bergantung pada waktu pembersihan bea cukai.'
        : 'Estimasi pengantaran kurir toko terverifikasi.',
      trackingHistory: initialHistory,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    order.shipmentId = shipment.id;
    order.trackingNumber = trackingNumber;
    this.schema.shipments.unshift(shipment);

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await safeAdminSetDoc(`${pfx}shipments`, shipment.id, shipment);
    } catch {}
  }

  public getOrders(filter?: { paymentStatus?: ShopPaymentStatus; orderStatus?: ShopOrderStatus }): ShopOrder[] {
    let list = [...this.schema.orders];
    if (filter?.paymentStatus) list = list.filter(o => o.paymentStatus === filter.paymentStatus);
    if (filter?.orderStatus) list = list.filter(o => o.orderStatus === filter.orderStatus);
    return list;
  }

  public getOrderById(id: string): ShopOrder | undefined {
    return this.schema.orders.find(o => o.id === id);
  }

  public getOrderByNumberAndPhone(orderNumberOrId: string, phone: string): ShopOrder | undefined {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    return this.schema.orders.find(o => {
      const matchId = o.id === orderNumberOrId || o.orderNumber === orderNumberOrId;
      const oPhone = o.customerPhone.replace(/[^0-9]/g, '');
      const matchPhone = oPhone === cleanPhone || oPhone.endsWith(cleanPhone) || cleanPhone.endsWith(oPhone);
      return matchId && matchPhone;
    });
  }

  public async findOrderById(id: string): Promise<ShopOrder | undefined> {
    const local = this.getOrderById(id) || this.schema.orders.find(o => o.orderNumber === id);
    if (local) return local;

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      const doc = await safeAdminGetDoc(`${pfx}orders`, id);
      if (doc) return doc as ShopOrder;
    } catch {}
    return undefined;
  }

  public async findOrderByNumberAndPhone(numberOrId: string, phone: string): Promise<ShopOrder | undefined> {
    return this.getOrderByNumberAndPhone(numberOrId, phone);
  }

  public getOrdersByCustomerPhone(phone: string): ShopOrder[] {
    const clean = phone.replace(/[^0-9]/g, '');
    return this.schema.orders.filter(o => {
      const op = o.customerPhone.replace(/[^0-9]/g, '');
      return op === clean || op.endsWith(clean) || clean.endsWith(op);
    });
  }

  public async uploadPaymentProof(orderIdOrNumber: string, paymentProofUrl: string): Promise<ShopOrder> {
    const order = this.getOrderById(orderIdOrNumber) || this.schema.orders.find(o => o.orderNumber === orderIdOrNumber);
    if (!order) throw new Error(`Pesanan ${orderIdOrNumber} tidak ditemukan.`);

    order.paymentProof = paymentProofUrl;
    order.paymentStatus = ShopPaymentStatus.WAITING_VERIFICATION;
    order.updatedAt = new Date().toISOString();

    this.persistToLocal();
    this.logAudit('UPLOAD_PAYMENT_PROOF', `Bukti bayar diunggah untuk #${order.orderNumber}`, order.customerName);

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await safeAdminSetDoc(`${pfx}orders`, order.id, order);
    } catch {}

    return order;
  }

  public async verifyPayment(actor: string, orderIdOrNumber: string, approved: boolean, reason?: string): Promise<ShopOrder> {
    const order = this.getOrderById(orderIdOrNumber) || this.schema.orders.find(o => o.orderNumber === orderIdOrNumber);
    if (!order) throw new Error(`Pesanan ${orderIdOrNumber} tidak ditemukan.`);

    const now = new Date().toISOString();
    if (approved) {
      order.paymentStatus = ShopPaymentStatus.PAID;
      order.orderStatus = ShopOrderStatus.PROCESSING;
      order.paidAt = now;
      this.logAudit('VERIFY_PAYMENT_APPROVED', `Pembayaran pesanan #${order.orderNumber} diverifikasi sah oleh ${actor}`, actor);
    } else {
      order.paymentStatus = ShopPaymentStatus.REJECTED;
      order.rejectionReason = reason || 'Bukti transfer tidak valid atau dana belum masuk.';
      this.logAudit('VERIFY_PAYMENT_REJECTED', `Pembayaran pesanan #${order.orderNumber} ditolak oleh ${actor}: ${order.rejectionReason}`, actor);
    }

    order.updatedAt = now;
    this.persistToLocal();

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await safeAdminSetDoc(`${pfx}orders`, order.id, order);
    } catch {}

    return order;
  }

  public async attachArtopayPayment(orderId: string, details: Partial<ShopOrder>): Promise<ShopOrder> {
    const order = this.getOrderById(orderId) || this.schema.orders.find(o => o.orderNumber === orderId);
    if (!order) throw new Error(`Pesanan Shop ${orderId} tidak ditemukan.`);

    Object.assign(order, details, { updatedAt: new Date().toISOString() });
    this.persistToLocal();

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await safeAdminSetDoc(`${pfx}orders`, order.id, order);
    } catch {}

    return order;
  }

  public async updateOrderStatus(actor: string, orderIdOrNumber: string, status: ShopOrderStatus, reason?: string): Promise<ShopOrder> {
    const order = this.getOrderById(orderIdOrNumber) || this.schema.orders.find(o => o.orderNumber === orderIdOrNumber);
    if (!order) throw new Error(`Pesanan ${orderIdOrNumber} tidak ditemukan.`);

    const oldStatus = order.orderStatus;
    order.orderStatus = status;
    order.updatedAt = new Date().toISOString();

    // If order was cancelled and was not cancelled before, restore stock
    if (status === ShopOrderStatus.CANCELLED && oldStatus !== ShopOrderStatus.CANCELLED) {
      order.cancelledAt = new Date().toISOString();
      order.cancellationReason = reason || 'Pesanan dibatalkan oleh pengguna atau admin toko.';
      for (const item of order.items) {
        const prod = this.getProductById(item.productId);
        if (prod) {
          prod.stock += item.quantity;
          prod.updatedAt = new Date().toISOString();
        }
      }
      this.logAudit('CANCEL_ORDER_STOCK_RESTORED', `Pesanan #${order.orderNumber} dibatalkan. Stok dipulihkan oleh ${actor}`, actor);
    } else {
      this.logAudit('UPDATE_ORDER_STATUS', `Status pesanan #${order.orderNumber} diubah ke ${status} oleh ${actor}`, actor);
    }

    this.persistToLocal();

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await safeAdminSetDoc(`${pfx}orders`, order.id, order);
    } catch {}

    return order;
  }

  // --- SHIPMENTS ---
  public getShipments(): ShopShipment[] {
    return [...this.schema.shipments];
  }

  public getShipmentById(id: string): ShopShipment | undefined {
    return this.schema.shipments.find(s => s.id === id);
  }

  public getShipmentByOrderId(orderId: string): ShopShipment | undefined {
    return this.schema.shipments.find(s => s.orderId === orderId);
  }

  public getShipmentByTrackingNumber(trackingNumber: string): ShopShipment | undefined {
    const clean = trackingNumber.trim().toUpperCase();
    return this.schema.shipments.find(s => s.trackingNumber.toUpperCase() === clean);
  }

  public getShippingOptions() {
    return courierRegistry.getAvailableShippingOptions();
  }

  public async createShipment(actor: string, data: Partial<ShopShipment>): Promise<ShopShipment> {
    const shipment: ShopShipment = {
      id: `ship_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orderId: data.orderId || '',
      trackingNumber: data.trackingNumber || `TPG-${Date.now().toString().slice(-6)}`,
      courierCode: data.courierCode || 'TUMPANG_LOCAL',
      courierName: data.courierName || 'Kurir Toko Tumpang',
      serviceName: data.serviceName || 'Reguler Toko',
      scope: data.scope || 'LOCAL',
      originCountry: data.originCountry || 'ID',
      originCity: data.originCity || 'Tumpang',
      destinationCountry: data.destinationCountry || 'ID',
      destinationCity: data.destinationCity || 'Tumpang',
      status: data.status || ShopShipmentStatus.WAITING_DISPATCH,
      isEstimateVerified: data.isEstimateVerified !== undefined ? data.isEstimateVerified : true,
      trackingHistory: data.trackingHistory || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.schema.shipments.unshift(shipment);
    this.persistToLocal();
    this.logAudit('CREATE_SHIPMENT', `Pengiriman dibuat #${shipment.trackingNumber} oleh ${actor}`, actor);
    return shipment;
  }

  public async updateShipmentStatus(actor: string, id: string, status: ShopShipmentStatus, details?: { location?: string; description?: string; note?: string }): Promise<ShopShipment> {
    const val = ShopSchemaValidator.validateShipmentStatus(status);
    if (!val.isValid) throw new Error(val.error);

    const shipment = this.getShipmentById(id);
    if (!shipment) throw new Error(`Pengiriman ${id} tidak ditemukan.`);

    const statusLabels: Record<string, string> = {
      WAITING_DISPATCH: 'Menunggu Pengiriman',
      PROCESSING: 'Diproses di Gudang',
      DISPATCHED: 'Dikirim dari Negara Asal',
      IN_TRANSIT: 'Dalam Perjalanan Internasional',
      ARRIVED_INDONESIA: 'Tiba di Indonesia',
      CUSTOMS_CLEARANCE: 'Pemeriksaan Bea Cukai',
      CUSTOMS_HOLD: 'Tertahan di Bea Cukai',
      TRANSFERRED_LOCAL_COURIER: 'Diteruskan Kurir Lokal',
      OUT_FOR_DELIVERY: 'Dalam Pengantaran',
      DELIVERED: 'Terkirim',
      FAILED_DELIVERY: 'Gagal Dikirim',
      RETURNED_TO_SENDER: 'Dikembalikan ke Pengirim'
    };
    const statusLabel = statusLabels[status] || status;

    shipment.status = status;
    (shipment as any).statusLabel = statusLabel;
    shipment.updatedAt = new Date().toISOString();

    const event: any = {
      id: `tevt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      status,
      statusLabel,
      location: details?.location || (shipment.scope === 'INTERNATIONAL' ? 'Hub Logistik Internasional' : 'Area Tumpang'),
      description: details?.description || `Pembaruan status pengiriman: ${statusLabel}`,
      timestamp: new Date().toISOString()
    };

    shipment.trackingHistory.unshift(event);

    // Update associated order and order shipment
    const order = this.getOrderById(shipment.orderId);
    if (order) {
      if (order.shipment) {
        order.shipment.status = status;
        (order.shipment as any).statusLabel = statusLabel;
        order.shipment.trackingHistory = shipment.trackingHistory;
      }
      if (status === ShopShipmentStatus.DELIVERED && order.orderStatus !== ShopOrderStatus.COMPLETED) {
        order.orderStatus = ShopOrderStatus.COMPLETED;
        order.deliveredAt = new Date().toISOString();
      }
      order.updatedAt = new Date().toISOString();
    }

    this.persistToLocal();
    this.logAudit('UPDATE_SHIPMENT_STATUS', `Status pengiriman #${shipment.trackingNumber} diubah ke ${status} oleh ${actor}`, actor);

    try {
      const pfx = shopEnv.database.firestoreCollectionPrefix;
      await safeAdminSetDoc(`${pfx}shipments`, shipment.id, shipment);
    } catch {}

    return shipment;
  }

  // --- REPORTS & METRICS ---
  public getSummaryMetrics(): any {
    const paidOrders = this.schema.orders.filter(o => o.paymentStatus === ShopPaymentStatus.PAID);
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const lowStockList = this.schema.products.filter(p => p.isActive && p.stock <= 10);

    return {
      totalRevenue,
      totalOrdersCount: this.schema.orders.length,
      paidOrdersCount: paidOrders.length,
      pendingOrdersCount: this.schema.orders.filter(o => o.paymentStatus === ShopPaymentStatus.UNPAID || o.paymentStatus === ShopPaymentStatus.WAITING_VERIFICATION).length,
      activeProductsCount: this.schema.products.filter(p => p.isActive).length,
      lowStockProducts: lowStockList.length,
      lowStockList,
      recentOrders: this.schema.orders.slice(0, 10)
    };
  }

  public getTransactionReport(startDate?: string, endDate?: string): any {
    let orders = [...this.schema.orders];
    if (startDate) {
      const s = new Date(startDate).getTime();
      orders = orders.filter(o => new Date(o.createdAt).getTime() >= s);
    }
    if (endDate) {
      const e = new Date(endDate).getTime();
      orders = orders.filter(o => new Date(o.createdAt).getTime() <= e);
    }

    const paidOrders = orders.filter(o => o.paymentStatus === ShopPaymentStatus.PAID);
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    const summary = {
      totalRevenue,
      totalOrdersCount: orders.length,
      paidOrdersCount: paidOrders.length
    };

    return {
      totalRevenue,
      totalOrdersCount: orders.length,
      paidOrdersCount: paidOrders.length,
      summary,
      orders
    };
  }
}

// Dedicated Singleton Instance of Shop Database
export const shopDb = new ShopDatabase();
