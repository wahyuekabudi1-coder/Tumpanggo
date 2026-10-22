/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop Standalone Database Engine
 * Completely decoupled from Tumpang Food and other services.
 * Manages all Shop marketplace state, products, categories, orders, shipments, and migrations.
 * 
 * Guarantees:
 * 1. Awaited Persistence: All create/update/delete operations wait for PostgreSQL commit before success.
 * 2. Race Condition Prevention: Uses row-level locking (SELECT FOR UPDATE) in PostgreSQL and serialized in-memory queues.
 * 3. Transparent Diagnostics: Explicitly detects PostgreSQL failures and distinguishes persistent SQL from ephemeral /tmp.
 * 4. Zero Food Firestore touch: Strictly prevents any reads or writes to Food's database.
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
import { shopPersistence, ShopStorageError } from './shopPersistence';

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
  private initPromise: Promise<void> | null = null;
  private migrationRunner = new ShopMigrationRunner();

  constructor() {
    this.schema = shopPersistence.loadInitialState(this.schema);
  }

  /**
   * Helper to execute state mutations atomically with PostgreSQL row-level locking
   * and in-memory queue serialization.
   * Awaits PostgreSQL commit before returning. Throws ShopStorageError on persistence failure.
   */
  private async mutate<T>(
    mutator: (lockedSchema: ShopDatabaseSchema) => Promise<{ updatedSchema: ShopDatabaseSchema; result: T }> | { updatedSchema: ShopDatabaseSchema; result: T }
  ): Promise<T> {
    const { updatedSchema, result } = await shopPersistence.executeAtomicMutation(
      () => this.schema,
      mutator
    );
    this.schema = updatedSchema;
    return result;
  }

  /**
   * Create non-destructive backup
   */
  public createBackup(): string {
    return shopPersistence.createBackup();
  }

  /**
   * Ensure database is initialized and migrated safely with mutex locking.
   * Completely decoupled from Food Firestore to prevent quota consumption.
   */
  public async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        // If PostgreSQL is configured, load remote persistent state
        const pgState = await shopPersistence.loadFromPostgres();
        if (pgState) {
          this.schema = {
            ...this.schema,
            ...pgState,
            config: { ...this.schema.config, ...(pgState.config || {}) }
          };
        }

        // Run automatic migrations & schema audit
        const { updatedDb, result } = await this.migrationRunner.runMigrations(this.schema);
        this.schema = updatedDb;
        await shopPersistence.persistState(this.schema);
        if (result.appliedCount > 0) {
          console.log(`[ShopDatabase] Migrasi database Shop diterapkan: ${result.message}`);
        }
        this.isInitialized = true;
      } catch (err: any) {
        console.warn('[ShopDatabase Init Error]', err?.message || err);
        this.isInitialized = true; // Fallback to memory
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Health & storage status for Shop service
   */
  public async getStorageStatus(): Promise<{
    service: string;
    databaseType: string;
    filePath: string;
    isPersistentOnServerless: boolean;
    liveCloudConnected: boolean;
    storageMode: string;
    decoupledFromFoodFirestore: boolean;
    totalCategories: number;
    totalProducts: number;
    totalOrders: number;
    totalShipments: number;
    diagnosticReason?: string;
    remediationStep?: string;
    lastError?: string;
    timestamp: string;
  }> {
    const diag = await shopPersistence.getDiagnostic();

    return {
      service: 'tumpang-shop',
      databaseType: diag.databaseType,
      filePath: diag.filePath,
      isPersistentOnServerless: diag.isPersistentOnServerless,
      liveCloudConnected: diag.liveCloudConnected,
      storageMode: diag.storageMode,
      decoupledFromFoodFirestore: true,
      totalCategories: this.schema.categories.length,
      totalProducts: this.schema.products.length,
      totalOrders: this.schema.orders.length,
      totalShipments: this.schema.shipments.length,
      diagnosticReason: diag.warning || 'Penyimpanan Tumpang Shop 100% mandiri dan terisolasi dari database Tumpang Food.',
      remediationStep: diag.remediationStep,
      lastError: diag.lastError,
      timestamp: new Date().toISOString()
    };
  }

  private createAuditLog(action: string, details: string, actor: string = 'system'): ShopAuditLog {
    return {
      id: `slog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      action,
      details,
      actor,
      timestamp: new Date().toISOString()
    };
  }

  public logAudit(action: string, details: string, actor: string = 'system') {
    const log = this.createAuditLog(action, details, actor);
    this.schema.auditLogs.unshift(log);
    if (this.schema.auditLogs.length > 500) {
      this.schema.auditLogs = this.schema.auditLogs.slice(0, 500);
    }
  }

  // --- CONFIG ---
  public getConfig(): ShopConfig {
    return { ...this.schema.config };
  }

  public async updateConfig(actor: string, updates: Partial<ShopConfig>): Promise<ShopConfig> {
    return this.mutate(current => {
      const config = {
        ...current.config,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      const log = this.createAuditLog('UPDATE_SHOP_CONFIG', `Pembaruan konfigurasi toko oleh ${actor}`, actor);
      const auditLogs = [log, ...current.auditLogs].slice(0, 500);
      return {
        updatedSchema: { ...current, config, auditLogs },
        result: config
      };
    });
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

    return this.mutate(current => {
      const categories = [...current.categories, newCategory];
      const log = this.createAuditLog('CREATE_CATEGORY', `Kategori ${newCategory.name} dibuat oleh ${actor}`, actor);
      const auditLogs = [log, ...current.auditLogs].slice(0, 500);
      return {
        updatedSchema: { ...current, categories, auditLogs },
        result: newCategory
      };
    });
  }

  public async updateCategory(actor: string, id: string, updates: Partial<ShopCategory>): Promise<ShopCategory> {
    return this.mutate(current => {
      const index = current.categories.findIndex(c => c.id === id);
      if (index === -1) throw new Error(`Kategori ${id} tidak ditemukan.`);

      const updated = {
        ...current.categories[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      const categories = [...current.categories];
      categories[index] = updated;

      const log = this.createAuditLog('UPDATE_CATEGORY', `Kategori ${updated.name} (${id}) diperbarui oleh ${actor}`, actor);
      const auditLogs = [log, ...current.auditLogs].slice(0, 500);
      return {
        updatedSchema: { ...current, categories, auditLogs },
        result: updated
      };
    });
  }

  public async deleteCategory(actor: string, id: string): Promise<boolean> {
    return this.mutate(current => {
      const index = current.categories.findIndex(c => c.id === id);
      if (index === -1) return { updatedSchema: current, result: false };

      const deleted = current.categories[index];
      const categories = current.categories.filter(c => c.id !== id);
      const log = this.createAuditLog('DELETE_CATEGORY', `Kategori ${deleted.name} (${id}) dihapus oleh ${actor}`, actor);
      const auditLogs = [log, ...current.auditLogs].slice(0, 500);
      return {
        updatedSchema: { ...current, categories, auditLogs },
        result: true
      };
    });
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

    return this.mutate(current => {
      const products = [...current.products, newProduct];
      const log = this.createAuditLog('CREATE_PRODUCT', `Produk ${newProduct.name} (${newProduct.sku}) dibuat oleh ${actor}`, actor);
      const auditLogs = [log, ...current.auditLogs].slice(0, 500);
      return {
        updatedSchema: { ...current, products, auditLogs },
        result: newProduct
      };
    });
  }

  public async updateProduct(actor: string, id: string, updates: any): Promise<ShopProduct> {
    return this.mutate(current => {
      const index = current.products.findIndex(p => p.id === id);
      if (index === -1) throw new Error(`Produk ${id} tidak ditemukan.`);

      const cur = current.products[index];
      const effectivePrice = typeof updates.price === 'number' ? updates.price : typeof updates.basePrice === 'number' ? updates.basePrice : cur.price;
      const updated: any = {
        ...cur,
        ...updates,
        id: cur.id,
        price: Math.round(effectivePrice),
        basePrice: Math.round(effectivePrice),
        stock: updates.stock !== undefined ? updates.stock : cur.stock,
        updatedAt: new Date().toISOString()
      };
      const products = [...current.products];
      products[index] = updated;

      const log = this.createAuditLog('UPDATE_PRODUCT', `Produk ${updated.name} (${id}) diperbarui oleh ${actor}`, actor);
      const auditLogs = [log, ...current.auditLogs].slice(0, 500);
      return {
        updatedSchema: { ...current, products, auditLogs },
        result: updated
      };
    });
  }

  public async deleteProduct(actor: string, id: string): Promise<boolean> {
    return this.mutate(current => {
      const index = current.products.findIndex(p => p.id === id);
      if (index === -1) return { updatedSchema: current, result: false };

      const deleted = current.products[index];
      const products = current.products.filter(p => p.id !== id);
      const log = this.createAuditLog('DELETE_PRODUCT', `Produk ${deleted.name} (${id}) dihapus oleh ${actor}`, actor);
      const auditLogs = [log, ...current.auditLogs].slice(0, 500);
      return {
        updatedSchema: { ...current, products, auditLogs },
        result: true
      };
    });
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

    // Atomic checkout mutation with row-level stock locking
    return this.mutate(current => {
      // 3. Item Validation, Pricing, and Stock Check against locked state
      const validatedItems: ShopOrderItem[] = [];
      let subtotal = 0;

      for (const itemInput of input.items) {
        if (!itemInput.productId || !itemInput.quantity || itemInput.quantity < 1) {
          throw new Error('Kuantitas produk tidak valid.');
        }
        const product = current.products.find(p => p.id === itemInput.productId);
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

      const minAmount = current.config.minOrderAmount || 0;
      if (subtotal < minAmount) {
        throw new Error(`Subtotal belanja minimal adalah Rp ${minAmount.toLocaleString('id-ID')}. Subtotal saat ini: Rp ${subtotal.toLocaleString('id-ID')}`);
      }

      // 4. Shipping Calculation
      const method = (input.shippingMethod || input.shippingOption?.code || 'INSTANT').toUpperCase();
      let deliveryFee = input.deliveryFee !== undefined ? Number(input.deliveryFee) : (current.config.defaultDeliveryFee || 4000);
      let shippingMethodLabel = 'Kurir Instan Tumpang Go';

      if (method === 'PICKUP') {
        deliveryFee = 0;
        shippingMethodLabel = 'Ambil Sendiri di Toko (Pickup)';
      } else if (method === 'REGULAR') {
        deliveryFee = input.deliveryFee !== undefined ? Number(input.deliveryFee) : Math.max(0, Math.round((current.config.defaultDeliveryFee || 4000) * 0.7));
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

      const serviceFee = input.serviceFee !== undefined ? Number(input.serviceFee) : (current.config.serviceFee || 1500);
      const uniqueCode = input.uniqueCode !== undefined ? Number(input.uniqueCode) : Math.floor(100 + Math.random() * 899);
      const total = subtotal + deliveryFee + serviceFee + uniqueCode;

      // Deduct stock from locked products
      const updatedProducts = current.products.map(p => {
        const orderedItem = validatedItems.find(it => it.productId === p.id);
        if (!orderedItem) return p;

        const updated = { ...p, stock: Math.max(0, p.stock - orderedItem.quantity), updatedAt: new Date().toISOString() };
        if (orderedItem.selectedVariation && updated.variations) {
          updated.variations = updated.variations.map(v => {
            if (v.id !== orderedItem.selectedVariation?.variationId) return v;
            return {
              ...v,
              options: v.options.map(o => {
                if (o.id !== orderedItem.selectedVariation?.optionId) return o;
                return { ...o, stock: typeof o.stock === 'number' ? Math.max(0, o.stock - orderedItem.quantity) : o.stock };
              })
            };
          });
        }
        return updated;
      });

      const now = new Date();
      const expiryMinutes = shopEnv.defaults.paymentExpiryMinutes || 30;
      const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000).toISOString();
      const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '');
      const dailyCount = current.orders.filter(o => o.createdAt && o.createdAt.startsWith(now.toISOString().slice(0, 10))).length + 1;
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

      const orders = [newOrder, ...current.orders];
      const shipments = [initialShipment, ...current.shipments];
      const log = this.createAuditLog('CREATE_SHOP_ORDER', `Pesanan dibuat: ${newOrder.orderNumber} (Resi: ${trackingNumber}) senilai Rp ${newOrder.total.toLocaleString('id-ID')}`, 'CUSTOMER');
      const auditLogs = [log, ...current.auditLogs].slice(0, 500);

      return {
        updatedSchema: { ...current, products: updatedProducts, orders, shipments, auditLogs },
        result: newOrder
      };
    });
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
    return this.getOrderById(id) || this.schema.orders.find(o => o.orderNumber === id);
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
    return this.mutate(current => {
      const index = current.orders.findIndex(o => o.id === orderIdOrNumber || o.orderNumber === orderIdOrNumber);
      if (index === -1) throw new Error(`Pesanan ${orderIdOrNumber} tidak ditemukan.`);

      const updated = {
        ...current.orders[index],
        paymentProof: paymentProofUrl,
        paymentStatus: ShopPaymentStatus.WAITING_VERIFICATION,
        updatedAt: new Date().toISOString()
      };
      const orders = [...current.orders];
      orders[index] = updated;

      const log = this.createAuditLog('UPLOAD_PAYMENT_PROOF', `Bukti bayar diunggah untuk #${updated.orderNumber}`, updated.customerName);
      const auditLogs = [log, ...current.auditLogs].slice(0, 500);

      return {
        updatedSchema: { ...current, orders, auditLogs },
        result: updated
      };
    });
  }

  public async verifyPayment(actor: string, orderIdOrNumber: string, approved: boolean, reason?: string): Promise<ShopOrder> {
    return this.mutate(current => {
      const index = current.orders.findIndex(o => o.id === orderIdOrNumber || o.orderNumber === orderIdOrNumber);
      if (index === -1) throw new Error(`Pesanan ${orderIdOrNumber} tidak ditemukan.`);

      const now = new Date().toISOString();
      const updated = { ...current.orders[index], updatedAt: now };

      let logMsg = '';
      if (approved) {
        updated.paymentStatus = ShopPaymentStatus.PAID;
        updated.orderStatus = ShopOrderStatus.PROCESSING;
        updated.paidAt = now;
        logMsg = `Pembayaran pesanan #${updated.orderNumber} diverifikasi sah oleh ${actor}`;
      } else {
        updated.paymentStatus = ShopPaymentStatus.REJECTED;
        updated.rejectionReason = reason || 'Bukti transfer tidak valid atau dana belum masuk.';
        logMsg = `Pembayaran pesanan #${updated.orderNumber} ditolak oleh ${actor}: ${updated.rejectionReason}`;
      }

      const orders = [...current.orders];
      orders[index] = updated;
      const log = this.createAuditLog(approved ? 'VERIFY_PAYMENT_APPROVED' : 'VERIFY_PAYMENT_REJECTED', logMsg, actor);
      const auditLogs = [log, ...current.auditLogs].slice(0, 500);

      return {
        updatedSchema: { ...current, orders, auditLogs },
        result: updated
      };
    });
  }

  public async attachArtopayPayment(orderId: string, details: Partial<ShopOrder>): Promise<ShopOrder> {
    return this.mutate(current => {
      const index = current.orders.findIndex(o => o.id === orderId || o.orderNumber === orderId);
      if (index === -1) throw new Error(`Pesanan Shop ${orderId} tidak ditemukan.`);

      const updated = {
        ...current.orders[index],
        ...details,
        updatedAt: new Date().toISOString()
      };
      const orders = [...current.orders];
      orders[index] = updated;

      return {
        updatedSchema: { ...current, orders },
        result: updated
      };
    });
  }

  public async updateOrderStatus(actor: string, orderIdOrNumber: string, status: ShopOrderStatus, reason?: string): Promise<ShopOrder> {
    return this.mutate(current => {
      const index = current.orders.findIndex(o => o.id === orderIdOrNumber || o.orderNumber === orderIdOrNumber);
      if (index === -1) throw new Error(`Pesanan ${orderIdOrNumber} tidak ditemukan.`);

      const oldOrder = current.orders[index];
      const oldStatus = oldOrder.orderStatus;
      const updatedOrder = {
        ...oldOrder,
        orderStatus: status,
        updatedAt: new Date().toISOString()
      };

      let products = [...current.products];
      let logMsg = '';

      // If order was cancelled and was not cancelled before, restore stock
      if (status === ShopOrderStatus.CANCELLED && oldStatus !== ShopOrderStatus.CANCELLED) {
        updatedOrder.cancelledAt = new Date().toISOString();
        updatedOrder.cancellationReason = reason || 'Pesanan dibatalkan oleh pengguna atau admin toko.';
        products = products.map(prod => {
          const item = updatedOrder.items.find(it => it.productId === prod.id);
          if (!item) return prod;
          return { ...prod, stock: prod.stock + item.quantity, updatedAt: new Date().toISOString() };
        });
        logMsg = `Pesanan #${updatedOrder.orderNumber} dibatalkan. Stok dipulihkan oleh ${actor}`;
      } else {
        logMsg = `Status pesanan #${updatedOrder.orderNumber} diubah ke ${status} oleh ${actor}`;
      }

      const orders = [...current.orders];
      orders[index] = updatedOrder;
      const log = this.createAuditLog('UPDATE_ORDER_STATUS', logMsg, actor);
      const auditLogs = [log, ...current.auditLogs].slice(0, 500);

      return {
        updatedSchema: { ...current, products, orders, auditLogs },
        result: updatedOrder
      };
    });
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

    return this.mutate(current => {
      const shipments = [shipment, ...current.shipments];
      const log = this.createAuditLog('CREATE_SHIPMENT', `Pengiriman dibuat #${shipment.trackingNumber} oleh ${actor}`, actor);
      const auditLogs = [log, ...current.auditLogs].slice(0, 500);
      return {
        updatedSchema: { ...current, shipments, auditLogs },
        result: shipment
      };
    });
  }

  public async updateShipmentStatus(actor: string, id: string, status: ShopShipmentStatus, details?: { location?: string; description?: string; note?: string }): Promise<ShopShipment> {
    const val = ShopSchemaValidator.validateShipmentStatus(status);
    if (!val.isValid) throw new Error(val.error);

    return this.mutate(current => {
      const sIndex = current.shipments.findIndex(s => s.id === id);
      if (sIndex === -1) throw new Error(`Pengiriman ${id} tidak ditemukan.`);

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

      const currentShipment = current.shipments[sIndex];
      const updatedShipment: any = {
        ...currentShipment,
        status,
        statusLabel,
        updatedAt: new Date().toISOString()
      };

      const event: any = {
        id: `tevt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        status,
        statusLabel,
        location: details?.location || (currentShipment.scope === 'INTERNATIONAL' ? 'Hub Logistik Internasional' : 'Area Tumpang'),
        description: details?.description || `Pembaruan status pengiriman: ${statusLabel}`,
        timestamp: new Date().toISOString()
      };
      updatedShipment.trackingHistory = [event, ...currentShipment.trackingHistory];

      const shipments = [...current.shipments];
      shipments[sIndex] = updatedShipment;

      // Also update linked order
      const orders = current.orders.map(o => {
        if (o.id !== updatedShipment.orderId) return o;
        const ord = { ...o, updatedAt: new Date().toISOString() };
        if (ord.shipment) {
          ord.shipment = { ...ord.shipment, status, statusLabel, trackingHistory: updatedShipment.trackingHistory };
        }
        if (status === ShopShipmentStatus.DELIVERED && ord.orderStatus !== ShopOrderStatus.COMPLETED) {
          ord.orderStatus = ShopOrderStatus.COMPLETED;
          ord.deliveredAt = new Date().toISOString();
        }
        return ord;
      });

      const log = this.createAuditLog('UPDATE_SHIPMENT_STATUS', `Status pengiriman #${updatedShipment.trackingNumber} diubah ke ${status} oleh ${actor}`, actor);
      const auditLogs = [log, ...current.auditLogs].slice(0, 500);

      return {
        updatedSchema: { ...current, shipments, orders, auditLogs },
        result: updatedShipment
      };
    });
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
