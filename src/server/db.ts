/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Isolated Database Module
 * Manages persistent storage, data integrity, and Firestore synchronization.
 */

import fs from 'fs';
import path from 'path';
import {
  Merchant, Category, MenuItem, Order, Driver, Settlement, AuditLog, SystemConfig,
  OrderStatus, PaymentStatus, SettlementStatus, AssignmentMode, PartnerRegistration,
  Testimonial, AppRole, OrderReceipt
} from '../types';
import { foodConfig, getMasterAccountCredentials } from './config';
import { hashPassword, verifyPassword } from './auth';
import { OrderService } from './services/orderService';
import { isDestinationInKecamatanTumpang, FLAT_TUMPANG_DELIVERY_FEE, normalizeOrderDeliveryFee } from '../utils/deliveryFee';
import {
  getAdminDb,
  safeAdminSetDoc,
  safeAdminDeleteDoc,
  safeAdminGetDoc,
  safeAdminGetDocs,
  runAdminTransaction,
  removeUndefinedFields,
  isFirestoreAdminConfigured,
  isUsingServiceAccount,
  testFirestoreConnection,
  getFirestoreDiagnosticStatus
} from './firebaseAdmin';

const FOOD_DB_FILE = foodConfig.localDbFile;
const LEGACY_DB_FILE = foodConfig.legacyDbFile;

// Administrative Firestore set helper alias
const safeFirestoreSetDoc = safeAdminSetDoc;

export interface PushSubscriptionRecord {
  id: string;
  role: 'MERCHANT' | 'DRIVER' | 'CUSTOMER';
  entityId: string;
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

interface DatabaseSchema {
  merchants: Merchant[];
  categories: Category[];
  menuItems: MenuItem[];
  orders: Order[];
  drivers: Driver[];
  settlements: Settlement[];
  auditLogs: AuditLog[];
  systemConfig: SystemConfig;
  partnerRegistrations: PartnerRegistration[];
  testimonials: Testimonial[];
  pushSubscriptions?: PushSubscriptionRecord[];
}

const initialConfig: SystemConfig = {
  serviceFee: 2000,
  deliveryFeePerKm: 1500,
  defaultDeliveryFee: 5000,
  commissionPercent: 10,
  assignmentMode: AssignmentMode.AUTOMATIC,
  qrisImage: '/qris-merchant.png',
  systemOpen: true
};

export class FoodDatabase {
  private data: DatabaseSchema;
  private isInitialized = false;
  private lastFileMtime = 0;

  constructor() {
    this.data = {
      merchants: [],
      categories: [],
      menuItems: [],
      orders: [],
      drivers: [],
      settlements: [],
      auditLogs: [],
      systemConfig: initialConfig,
      partnerRegistrations: [],
      testimonials: [],
      pushSubscriptions: []
    };
    this.loadAndMigrate();
  }

  public createBackup(): boolean {
    try {
      const backupPath = FOOD_DB_FILE + '.backup.json';
      fs.writeFileSync(backupPath, JSON.stringify(this.data, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Loads from food database file or migrates safely from backup / legacy file.
   */
  private loadAndMigrate() {
    const backupPath = FOOD_DB_FILE + '.backup.json';
    try {
      if (fs.existsSync(FOOD_DB_FILE)) {
        const content = fs.readFileSync(FOOD_DB_FILE, 'utf-8');
        if (content && content.trim().length > 10) {
          this.data = JSON.parse(content);
          this.ensureStructure();
          this.migratePasswords();
          this.migrateOrdersDeliveryFee();
          this.createBackup();
          console.log('[TumpangFood DB] Loaded primary operational state from tumpang_food_db.json');
          return;
        }
      }

      // Serverless cold-start bootstrap: search candidate paths for bundled seed file
      const candidateSeedPaths: string[] = [
        path.join(process.cwd(), 'tumpang_food_db.json'),
        path.join('/var/task', 'tumpang_food_db.json')
      ];

      for (const candidate of candidateSeedPaths) {
        if (FOOD_DB_FILE !== candidate && fs.existsSync(candidate)) {
          try {
            const seedContent = fs.readFileSync(candidate, 'utf-8');
            if (seedContent && seedContent.trim().length > 10) {
              this.data = JSON.parse(seedContent);
              this.ensureStructure();
              this.migratePasswords();
              this.migrateOrdersDeliveryFee();
              this.save();
              this.createBackup();
              console.log(`[TumpangFood DB] Successfully bootstrapped serverless database from ${candidate}`);
              return;
            }
          } catch (e: any) {
            console.warn(`[TumpangFood DB] Failed reading seed database at ${candidate}:`, e.message);
          }
        }
      }

      // Fallback 1: Try backup snapshot
      if (fs.existsSync(backupPath)) {
        console.warn('[TumpangFood DB] Primary database corrupted or empty. Recovering from backup snapshot...');
        const backupContent = fs.readFileSync(backupPath, 'utf-8');
        this.data = JSON.parse(backupContent);
        this.ensureStructure();
        this.save();
        console.log('[TumpangFood DB] Recovery from backup successful.');
        return;
      }

      // Fallback 2: Safe initial migration from legacy database file
      if (fs.existsSync(LEGACY_DB_FILE)) {
        console.log('[TumpangFood DB] Migrating data from legacy tumpang_db.json...');
        const legacyContent = fs.readFileSync(LEGACY_DB_FILE, 'utf-8');
        this.data = JSON.parse(legacyContent);
        this.ensureStructure();
        this.migratePasswords();
        this.save();
        this.createBackup();
        console.log('[TumpangFood DB] Migration complete! Saved to tumpang_food_db.json.');
      } else {
        // Initialize fresh clean operational database without dummy merchants
        this.data = {
          merchants: [],
          categories: [],
          menuItems: [],
          orders: [],
          drivers: [],
          settlements: [],
          auditLogs: [],
          systemConfig: { ...initialConfig },
          partnerRegistrations: [],
          testimonials: [],
          pushSubscriptions: []
        };
        this.bootstrapMasterAccount();
        this.save();
        this.createBackup();
      }
    } catch (err) {
      console.error('[TumpangFood DB] Error during load/migrate, attempting emergency recovery:', err);
      if (fs.existsSync(backupPath)) {
        try {
          this.data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
          this.ensureStructure();
          this.save();
          return;
        } catch {
          // ignore
        }
      }
      this.data = {
        merchants: [],
        categories: [],
        menuItems: [],
        orders: [],
        drivers: [],
        settlements: [],
        auditLogs: [],
        systemConfig: { ...initialConfig },
        partnerRegistrations: [],
        testimonials: [],
        pushSubscriptions: []
      };
      this.bootstrapMasterAccount();
      this.save();
    }
  }

  private migratePasswords() {
    let changed = false;
    for (const m of this.data.merchants) {
      if (!m.password) {
        m.password = hashPassword(m.id + '123');
        changed = true;
      } else if (!m.password.startsWith('pbkdf2$')) {
        m.password = hashPassword(m.password);
        changed = true;
      }
    }
    for (const d of this.data.drivers) {
      if (!(d as any).password) {
        (d as any).password = hashPassword(d.id + '123');
        changed = true;
      } else if (!(d as any).password.startsWith('pbkdf2$')) {
        (d as any).password = hashPassword((d as any).password);
        changed = true;
      }
    }
    if (changed) this.save();
  }

  private migrateOrdersDeliveryFee() {
    let changed = false;
    if (!Array.isArray(this.data.orders)) return;

    for (const order of this.data.orders) {
      if (!order) continue;
      const inTumpang = isDestinationInKecamatanTumpang({
        address: order.deliveryAddress,
        details: order.deliveryDetails,
        landmark: order.landmark,
        latitude: order.latitude,
        longitude: order.longitude
      });

      if (inTumpang) {
        if (order.deliveryFee !== FLAT_TUMPANG_DELIVERY_FEE) {
          console.log(`[TumpangFood DB Migration] Updating order #${order.id} delivery fee from ${order.deliveryFee} to flat ${FLAT_TUMPANG_DELIVERY_FEE}`);
          order.deliveryFee = FLAT_TUMPANG_DELIVERY_FEE;
          order.total = order.subtotal + FLAT_TUMPANG_DELIVERY_FEE + order.serviceFee + (order.uniqueCode || 0);
          changed = true;
        }
      }
    }
    if (changed) {
      this.save();
      console.log('[TumpangFood DB Migration] Successfully migrated orders to flat Rp 5.000 for Kecamatan Tumpang.');
    }
  }

  private ensureStructure() {
    if (!this.data.merchants) this.data.merchants = [];
    if (!this.data.categories) this.data.categories = [];
    if (!this.data.menuItems) this.data.menuItems = [];
    if (!this.data.orders) this.data.orders = [];
    if (!this.data.drivers) this.data.drivers = [];
    if (!this.data.settlements) this.data.settlements = [];
    if (!this.data.partnerRegistrations) this.data.partnerRegistrations = [];
    if (!this.data.testimonials) this.data.testimonials = [];
    if (!this.data.pushSubscriptions) this.data.pushSubscriptions = [];
    if (!this.data.systemConfig) {
      this.data.systemConfig = initialConfig;
    } else if (!this.data.systemConfig.qrisImage || this.data.systemConfig.qrisImage.includes('unsplash')) {
      this.data.systemConfig.qrisImage = '/qris-merchant.png';
    }

    this.data.merchants.forEach(m => {
      if (!m.qrisImage || m.qrisImage.includes('unsplash')) {
        m.qrisImage = '/qris-merchant.png';
      }
    });

    // Idempotent migration: Ensure all existing orders have a canonical public orderNumber
    let ordersBackfilled = false;
    for (const o of this.data.orders) {
      if (!o.orderNumber) {
        const cleanId = (o.id || '').replace(/^ord_/, '').toUpperCase();
        o.orderNumber = `TF-${cleanId}`;
        ordersBackfilled = true;
      }
      if (o.receipt && !o.receipt.orderNumber) {
        o.receipt.orderNumber = o.orderNumber;
        ordersBackfilled = true;
      }
    }
    if (ordersBackfilled) {
      this.save();
    }

    // Master account credentials initialization (no auto-seed of dummy merchants)
    this.bootstrapMasterAccount();
  }

  private seedInitial() {
    this.data.systemConfig = { ...initialConfig };
    this.bootstrapMasterAccount();
    const now = new Date().toISOString();

    this.data.merchants = [
      {
        id: 'm1',
        name: 'Warung Bakso & Mie Ayam Barokah',
        ownerName: 'Pak Slamet',
        phone: '081234567891',
        address: 'Jl. Raya Tumpang No. 45, Kec. Tumpang, Malang',
        latitude: -7.9984,
        longitude: 112.7663,
        openTime: '09:00',
        closeTime: '21:00',
        bankName: 'BRI',
        bankAccount: '1234567890',
        bankHolder: 'Pak Slamet',
        active: true,
        rating: 4.8,
        cookTimeEstimate: '15-25 min',
        image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=500&auto=format&fit=crop&q=60',
        description: 'Bakso urat sapi asli, mie ayam ceker spesial khas Tumpang.',
        category: 'Makanan Berat',
        email: 'm1@tumpanggo.com',
        qrisImage: '/qris-merchant.png',
        createdAt: now,
        updatedAt: now,
        isActivated: true,
        password: hashPassword('m1123')
      },
      {
        id: 'm2',
        name: 'Ayam Geprek Sambal Korek Tumpang',
        ownerName: 'Bu Siti Aminah',
        phone: '081234567892',
        address: 'Jl. Pahlawan No. 12, Kec. Tumpang, Malang',
        latitude: -8.0012,
        longitude: 112.7681,
        openTime: '10:00',
        closeTime: '22:00',
        bankName: 'BCA',
        bankAccount: '0987654321',
        bankHolder: 'Bu Siti Aminah',
        active: true,
        rating: 4.7,
        cookTimeEstimate: '15-20 min',
        image: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=500&auto=format&fit=crop&q=60',
        description: 'Ayam goreng renyah krispi dengan kepedasan sambal korek khas Tumpang.',
        category: 'Aneka Ayam',
        email: 'm2@tumpanggo.com',
        qrisImage: '/qris-merchant.png',
        createdAt: now,
        updatedAt: now,
        isActivated: true,
        password: hashPassword('m2123')
      }
    ];

    this.data.categories = [
      { id: 'cat_m1_1', merchantId: 'm1', name: 'Menu Utama', orderIndex: 1 },
      { id: 'cat_m1_2', merchantId: 'm1', name: 'Minuman Segar', orderIndex: 2 },
      { id: 'cat_m2_1', merchantId: 'm2', name: 'Paket Geprek', orderIndex: 1 }
    ];

    this.data.menuItems = [
      {
        id: 'menu_1',
        merchantId: 'm1',
        categoryId: 'cat_m1_1',
        name: 'Bakso Spesial Tumpang',
        description: 'Bakso daging sapi asli dengan kuah kaldu gurih khas Tumpang',
        price: 15000,
        available: true,
        image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&auto=format&fit=crop&q=60',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'menu_2',
        merchantId: 'm1',
        categoryId: 'cat_m1_1',
        name: 'Mie Ayam Ceker Bakso',
        description: 'Mie kenyal dengan potongan ayam berbumbu manis gurih dan ceker empuk',
        price: 13000,
        available: true,
        image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=400&auto=format&fit=crop&q=60',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'menu_3',
        merchantId: 'm1',
        categoryId: 'cat_m1_2',
        name: 'Es Jeruk Manis Segar',
        description: 'Perasan jeruk peras asli dingin menyegarkan',
        price: 5000,
        available: true,
        image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=400&auto=format&fit=crop&q=60',
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'menu_4',
        merchantId: 'm2',
        categoryId: 'cat_m2_1',
        name: 'Paket Ayam Geprek Sambal Bawang + Nasi',
        description: 'Ayam geprek pedas gurih lengkap dengan nasi hangat dan lalapan',
        price: 18000,
        available: true,
        image: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400&auto=format&fit=crop&q=60',
        createdAt: now,
        updatedAt: now
      }
    ];

    this.data.drivers = [
      {
        id: 'd1',
        name: 'Budi Santoso',
        phone: '081234567893',
        email: 'driver1@tumpanggo.com',
        active: true,
        online: true,
        latitude: -7.982,
        longitude: 112.631,
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'd2',
        name: 'Agus Pratama',
        phone: '081234567894',
        email: 'driver2@tumpanggo.com',
        active: true,
        online: true,
        latitude: -7.985,
        longitude: 112.635,
        createdAt: now,
        updatedAt: now
      }
    ];

    for (const d of this.data.drivers) {
      (d as any).password = hashPassword(d.id + '123');
    }
  }

  public save() {
    try {
      const dir = path.dirname(FOOD_DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(FOOD_DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
      try {
        this.lastFileMtime = fs.statSync(FOOD_DB_FILE).mtimeMs;
      } catch {}
    } catch (e: any) {
      if (e.code === 'EROFS') {
        console.warn('[TumpangFood DB] Read-only filesystem detected. Disk write skipped; persisting in-memory and Firestore.');
      } else {
        console.error('[TumpangFood DB] Failed to save database file:', e);
      }
    }
  }

  /**
   * Reload database state from disk if file was updated by another process/worker
   */
  public reloadFromDiskIfNeeded(): boolean {
    try {
      if (fs.existsSync(FOOD_DB_FILE)) {
        const stats = fs.statSync(FOOD_DB_FILE);
        if (stats.mtimeMs > this.lastFileMtime) {
          const content = fs.readFileSync(FOOD_DB_FILE, 'utf-8');
          if (content && content.trim().length > 10) {
            const parsed = JSON.parse(content);
            if (parsed && typeof parsed === 'object') {
              if (Array.isArray(parsed.orders)) this.data.orders = parsed.orders;
              if (Array.isArray(parsed.merchants)) this.data.merchants = parsed.merchants;
              if (Array.isArray(parsed.drivers)) this.data.drivers = parsed.drivers;
              if (Array.isArray(parsed.categories)) this.data.categories = parsed.categories;
              if (Array.isArray(parsed.menuItems)) this.data.menuItems = parsed.menuItems;
              if (Array.isArray(parsed.settlements)) this.data.settlements = parsed.settlements;
              if (Array.isArray(parsed.partnerRegistrations)) this.data.partnerRegistrations = parsed.partnerRegistrations;
              if (Array.isArray(parsed.testimonials)) this.data.testimonials = parsed.testimonials;
              if (parsed.systemConfig) this.data.systemConfig = parsed.systemConfig;
              this.lastFileMtime = stats.mtimeMs;
              console.log(`[TumpangFood DB] Auto-reloaded ${this.data.orders.length} orders from disk snapshot.`);
              return true;
            }
          }
        }
      }
    } catch (e: any) {
      console.warn('[TumpangFood DB] Error during disk reload check:', e.message);
    }
    return false;
  }

  private initPromise: Promise<void> | null = null;
  private lastSyncTimestamp = 0;
  private readonly CACHE_TTL_MS = 15000;

  public async ensureInitialized(forceRefresh = false): Promise<void> {
    if (this.isInitialized && !forceRefresh && (Date.now() - this.lastSyncTimestamp < this.CACHE_TTL_MS)) {
      return;
    }
    if (!this.initPromise || forceRefresh) {
      this.initPromise = this.init();
    }
    try {
      await this.initPromise;
      this.lastSyncTimestamp = Date.now();
    } catch (err) {
      this.initPromise = null;
      this.isInitialized = false;
      throw err;
    }
  }

  /**
   * Diagnostic assessment of runtime storage status: Cloud Firestore vs Local Resilient Snapshot.
   */
  public async getStorageStatus(): Promise<{
    storageMode: 'cloud_firestore_active' | 'local_resilient_snapshot';
    databaseId: string;
    projectId: string;
    isProduction: boolean;
    firestoreConfigured: boolean;
    usingServiceAccount: boolean;
    authIdentity: string;
    liveCloudConnected: boolean;
    canRead: boolean;
    canWrite: boolean;
    diagnosticReason: string;
    diagnosticDetail: string;
    remediationStep?: string;
    cloudError?: string;
  }> {
    const firestoreCheck = await testFirestoreConnection();
    return {
      storageMode: firestoreCheck.connected ? 'cloud_firestore_active' : 'local_resilient_snapshot',
      databaseId: firestoreCheck.databaseId,
      projectId: firestoreCheck.projectId,
      isProduction: foodConfig.isProduction,
      firestoreConfigured: isFirestoreAdminConfigured(),
      usingServiceAccount: firestoreCheck.usingServiceAccount,
      authIdentity: firestoreCheck.authIdentity,
      liveCloudConnected: firestoreCheck.connected,
      canRead: firestoreCheck.canRead,
      canWrite: firestoreCheck.canWrite,
      diagnosticReason: firestoreCheck.diagnosticReason,
      diagnosticDetail: firestoreCheck.diagnosticDetail,
      remediationStep: firestoreCheck.remediationStep,
      cloudError: firestoreCheck.error
    };
  }

  /**
   * Synchronize state with Firebase Firestore as Primary Storage.
   */
  public async init() {
    // 1. Check if Firebase Admin SDK has valid explicit credentials
    if (!isUsingServiceAccount() || !getAdminDb()) {
      const diag = getFirestoreDiagnosticStatus();
      console.warn(`[TumpangFood DB] Firestore Admin SDK tidak terkonfigurasi (${diag.reason}), beroperasi dengan penyimpanan lokal.`);
      this.isInitialized = true;
      return;
    }

    // 2. Perform live connection probe to verify actual Firestore Cloud accessibility
    const probe = await testFirestoreConnection();
    if (!probe.connected) {
      console.warn(`[TumpangFood DB] Firestore Cloud belum terhubung (${probe.diagnosticReason}: ${probe.error || probe.diagnosticDetail}). Beroperasi dengan penyimpanan lokal.`);
      this.isInitialized = true;
      return;
    }

    this.isInitialized = true;

    try {
      console.log('[TumpangFood DB] Syncing with Firestore database via Admin SDK:', foodConfig.databaseId);

      // System Config
      try {
        const remoteConfig = await safeAdminGetDoc('systemConfig', 'config_1');
        if (remoteConfig) {
          this.data.systemConfig = { ...initialConfig, ...remoteConfig } as SystemConfig;
          this.bootstrapMasterAccount();
        } else {
          await safeAdminSetDoc('systemConfig', 'config_1', this.data.systemConfig);
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync systemConfig with Firestore:', e.message);
      }

      // Merchants (Firestore as Primary Store)
      try {
        const remoteMerchants = await safeAdminGetDocs('merchants');
        if (remoteMerchants.length > 0) {
          this.data.merchants = remoteMerchants as Merchant[];
          this.ensureStructure();
        } else if (this.data.merchants.length > 0) {
          for (const m of this.data.merchants) {
            await safeAdminSetDoc('merchants', m.id, m);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync merchants with Firestore:', e.message);
      }

      // Categories
      try {
        const remoteCats = await safeAdminGetDocs('categories');
        if (remoteCats.length > 0) {
          this.data.categories = remoteCats as Category[];
        } else if (this.data.categories.length > 0) {
          for (const c of this.data.categories) {
            await safeAdminSetDoc('categories', c.id, c);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync categories with Firestore:', e.message);
      }

      // Menu Items
      try {
        const remoteItems = await safeAdminGetDocs('menuItems');
        if (remoteItems.length > 0) {
          this.data.menuItems = remoteItems as MenuItem[];
        } else if (this.data.menuItems.length > 0) {
          for (const i of this.data.menuItems) {
            await safeAdminSetDoc('menuItems', i.id, i);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync menuItems with Firestore:', e.message);
      }

      // Drivers
      try {
        const remoteDrivers = await safeAdminGetDocs('drivers');
        if (remoteDrivers.length > 0) {
          this.data.drivers = remoteDrivers as Driver[];
        } else if (this.data.drivers.length > 0) {
          for (const d of this.data.drivers) {
            await safeAdminSetDoc('drivers', d.id, d);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync drivers with Firestore:', e.message);
      }

      // Orders
      try {
        const remoteOrders = await safeAdminGetDocs('orders');
        if (remoteOrders.length > 0) {
          this.data.orders = (remoteOrders as Order[]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        } else if (this.data.orders.length > 0) {
          for (const o of this.data.orders) {
            await safeAdminSetDoc('orders', o.id, o);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync orders with Firestore:', e.message);
      }

      // Settlements
      try {
        const remoteSets = await safeAdminGetDocs('settlements');
        if (remoteSets.length > 0) {
          this.data.settlements = remoteSets as Settlement[];
        } else if (this.data.settlements.length > 0) {
          for (const s of this.data.settlements) {
            await safeAdminSetDoc('settlements', s.id, s);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync settlements with Firestore:', e.message);
      }

      // Partner Registrations
      try {
        const remoteRegs = await safeAdminGetDocs('partnerRegistrations');
        if (remoteRegs.length > 0) {
          this.data.partnerRegistrations = remoteRegs as PartnerRegistration[];
        } else if (this.data.partnerRegistrations.length > 0) {
          for (const r of this.data.partnerRegistrations) {
            await safeAdminSetDoc('partnerRegistrations', r.id, r);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync partnerRegistrations with Firestore:', e.message);
      }

      // Testimonials (Cerita Pengguna)
      try {
        const remoteTestis = await safeAdminGetDocs('testimonials');
        if (remoteTestis.length > 0) {
          this.data.testimonials = remoteTestis as Testimonial[];
        } else if (this.data.testimonials && this.data.testimonials.length > 0) {
          for (const t of this.data.testimonials) {
            await safeAdminSetDoc('testimonials', t.id, t);
          }
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync testimonials with Firestore:', e.message);
      }


      // Audit Logs
      try {
        const remoteLogs = await safeAdminGetDocs('auditLogs');
        if (remoteLogs.length > 0) {
          this.data.auditLogs = (remoteLogs as AuditLog[])
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 500);
        }
      } catch (e: any) {
        console.warn('[TumpangFood DB] Failed to sync auditLogs with Firestore:', e.message);
      }

      this.save();
      this.createBackup();
      console.log('[TumpangFood DB] Firestore Admin synchronization successful (Primary Store Active).');
    } catch (err: any) {
      if (foodConfig.isProduction) {
        this.isInitialized = false;
        throw new Error(`[Produksi] Sinkronisasi data dengan Firestore Cloud gagal: ${err.message}. Operasi database ditolak demi integritas data.`);
      }
      console.error('[TumpangFood DB] Firestore sync failed, continuing locally:', err.message);
    }
  }

  // --- LOGGING ---
  public log(userId: string, details: string, role: AppRole = 'SYSTEM'): AuditLog {
    const logItem: AuditLog = {
      id: 'log_' + Math.random().toString(36).substring(2, 9),
      action: details.split(' ')[0] || 'ACTION',
      userId,
      role,
      details,
      createdAt: new Date().toISOString()
    };
    this.data.auditLogs.unshift(logItem);
    if (this.data.auditLogs.length > 250) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 250);
    }
    this.save();

    safeFirestoreSetDoc('auditLogs', logItem.id, logItem);
    return logItem;
  }

  public addAuditLog(entry: { action?: string; orderId?: string; details: string; performedBy?: string; userId?: string; role?: 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'SYSTEM' | 'CUSTOMER' | 'SHOP_ADMIN' }): AuditLog {
    const userId = entry.performedBy || entry.userId || 'SYSTEM';
    const details = entry.details || (entry.action ? `${entry.action}: ${entry.orderId || ''}` : 'Audit log');
    const role = entry.role || 'SYSTEM';
    return this.log(userId, details, role);
  }

  public getLogs(): AuditLog[] {
    return this.data.auditLogs;
  }

  // --- MASTER ACCOUNT CREDENTIALS ---
  public getMasterAccount(): { email: string; passwordHash: string; updatedAt: string } | undefined {
    try {
      if (fs.existsSync(FOOD_DB_FILE)) {
        const stats = fs.statSync(FOOD_DB_FILE);
        if (stats.mtimeMs > this.lastFileMtime) {
          const content = fs.readFileSync(FOOD_DB_FILE, 'utf-8');
          const parsed = JSON.parse(content);
          if (parsed?.systemConfig?.masterAccount) {
            if (!this.data.systemConfig) {
              this.data.systemConfig = { ...initialConfig };
            }
            this.data.systemConfig.masterAccount = parsed.systemConfig.masterAccount;
            this.lastFileMtime = stats.mtimeMs;
          }
        }
      }
    } catch {}
    if (!this.data.systemConfig?.masterAccount) {
      this.bootstrapMasterAccount();
    }
    return this.data.systemConfig?.masterAccount;
  }

  public bootstrapMasterAccount(): void {
    if (!this.data.systemConfig) {
      this.data.systemConfig = { ...initialConfig };
    }
    const creds = getMasterAccountCredentials();
    const currentMaster = this.data.systemConfig.masterAccount;

    // 1. If masterAccount already exists with a valid PBKDF2 hash, preserve it.
    if (currentMaster?.passwordHash && currentMaster.passwordHash.startsWith('pbkdf2$')) {
      // Only update if the owner explicitly configured a non-empty environment variable that differs
      if (creds.hasExplicitEnv && creds.password && !verifyPassword(creds.password, currentMaster.passwordHash).valid) {
        this.data.systemConfig.masterAccount = {
          email: creds.email,
          passwordHash: hashPassword(creds.password),
          updatedAt: new Date().toISOString()
        };
        this.save();
        console.log(`[TumpangFood DB] Master Account PBKDF2 hash synchronized from explicit environment variable (${creds.email}).`);
      }
      return;
    }

    // 2. Initialize masterAccount if missing or invalid hash
    const initialPass = creds.password || (foodConfig.isProduction ? '' : 'TumpangGoAdmin#2026');
    if (initialPass) {
      this.data.systemConfig.masterAccount = {
        email: creds.email || 'tumpanggo@gmail.com',
        passwordHash: hashPassword(initialPass),
        updatedAt: new Date().toISOString()
      };
      this.save();
      console.log(`[TumpangFood DB] Master Account PBKDF2 hash initialized for ${creds.email || 'tumpanggo@gmail.com'}.`);
    }
  }

  public updateMasterAccountPassword(newPlaintext: string): boolean {
    if (!this.data.systemConfig) {
      this.data.systemConfig = { ...initialConfig };
    }
    const { email } = getMasterAccountCredentials();
    const cleanPlaintext = newPlaintext.trim();
    const hashed = hashPassword(cleanPlaintext);
    this.data.systemConfig.masterAccount = {
      email,
      passwordHash: hashed,
      updatedAt: new Date().toISOString()
    };
    this.save();

    // Persist to Cloud Firestore if configured and active
    try {
      safeFirestoreSetDoc('systemConfig', 'config_1', this.data.systemConfig).catch(() => {});
    } catch {}

    return true;
  }

  public updateMasterAccountWithHash(email: string, passwordHash: string): boolean {
    if (!this.data.systemConfig) {
      this.data.systemConfig = { ...initialConfig };
    }
    this.data.systemConfig.masterAccount = {
      email: email.trim().toLowerCase(),
      passwordHash,
      updatedAt: new Date().toISOString()
    };
    this.save();

    // Persist to Cloud Firestore if configured and active
    try {
      safeFirestoreSetDoc('systemConfig', 'config_1', this.data.systemConfig).catch(() => {});
    } catch {}

    return true;
  }

  // --- PRODUCTION PERSISTENCE SAFEGUARD ---
  public async ensureProductionCloudReady(actionName: string): Promise<void> {
    if (!foodConfig.isProduction) return;
    if (!isFirestoreAdminConfigured()) {
      throw new Error(`[Produksi] Cloud Firestore belum dikonfigurasi. Operasi "${actionName}" dibatalkan demi integritas data.`);
    }
    const probe = await testFirestoreConnection();
    if (!probe.connected) {
      throw new Error(`[Produksi] Koneksi cloud Firestore tidak tersedia (${probe.diagnosticReason}). Operasi "${actionName}" dibatalkan demi integritas data.`);
    }
  }

  // --- CONFIG ---
  public getConfig(): SystemConfig {
    return this.data.systemConfig;
  }

  public async updateConfig(userId: string, updates: Partial<SystemConfig>): Promise<SystemConfig> {
    await this.ensureProductionCloudReady('Pembaruan Konfigurasi');
    const prevConfig = { ...this.data.systemConfig };
    this.data.systemConfig = { ...this.data.systemConfig, ...updates };
    this.save();
    this.log(userId, `Updated system configuration`, 'ADMIN');

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('systemConfig', 'config_1', this.data.systemConfig);
      if (!persisted) {
        this.data.systemConfig = prevConfig;
        this.save();
        throw new Error('[Produksi] Gagal menyimpan konfigurasi sistem ke cloud Firestore. Perubahan dibatalkan demi integritas data.');
      }
    } else {
      safeFirestoreSetDoc('systemConfig', 'config_1', this.data.systemConfig);
    }
    return this.data.systemConfig;
  }

  // --- MERCHANTS ---
  public getMerchants(): Merchant[] {
    if (!this.data || !Array.isArray(this.data.merchants)) {
      return [];
    }
    return this.data.merchants
      .filter((m): m is Merchant => Boolean(m && typeof m === 'object'))
      .map(m => {
        const { password, ...safe } = m;
        if (!safe.qrisImage || safe.qrisImage.includes('unsplash')) {
          safe.qrisImage = this.data.systemConfig?.qrisImage || '/qris-merchant.png';
        }
        return {
          ...safe,
          id: safe.id || 'm_unknown'
        } as Merchant;
      });
  }

  public getMerchantById(id: string): Merchant | undefined {
    if (!this.data || !Array.isArray(this.data.merchants) || !id) return undefined;
    const m = this.data.merchants.find(m => m && m.id === id);
    if (!m) return undefined;
    const { password, ...safe } = m;
    if (!safe.qrisImage || safe.qrisImage.includes('unsplash')) {
      safe.qrisImage = this.data.systemConfig?.qrisImage || '/qris-merchant.png';
    }
    return safe as Merchant;
  }

  public getMerchantByEmailOrPhone(identifier: string): Merchant | undefined {
    if (!identifier || !this.data || !Array.isArray(this.data.merchants)) return undefined;
    const clean = identifier.trim().toLowerCase();
    const rawClean = identifier.trim();
    const cleanNumbers = identifier.replace(/[^0-9]/g, '');
    const altPhone = cleanNumbers.startsWith('62') 
      ? '0' + cleanNumbers.slice(2) 
      : (cleanNumbers.startsWith('0') ? '62' + cleanNumbers.slice(1) : '');

    return this.data.merchants.find(m => {
      if (!m) return false;
      const mId = typeof m.id === 'string' ? m.id.toLowerCase() : '';
      const mEmail = typeof m.email === 'string' ? m.email.trim().toLowerCase() : '';
      const mPhone = typeof m.phone === 'string' ? m.phone.trim() : '';
      const mPhoneNumbers = mPhone.replace(/[^0-9]/g, '');

      const matchId = Boolean(mId && mId === clean);
      const matchEmail = Boolean(mEmail && mEmail === clean);
      const matchPhone = Boolean(mPhone && (mPhone === rawClean || mPhone.toLowerCase() === clean));
      const matchCleanPhone = Boolean(cleanNumbers.length >= 8 && mPhoneNumbers && (
        mPhoneNumbers === cleanNumbers || 
        (altPhone && mPhoneNumbers === altPhone)
      ));

      return matchId || matchEmail || matchPhone || matchCleanPhone;
    });
  }

  public async createMerchant(userId: string, merchantData: Omit<Merchant, 'id' | 'createdAt' | 'updatedAt' | 'rating'>): Promise<Merchant> {
    await this.ensureProductionCloudReady('Pendaftaran Merchant');
    const newMerchant: Merchant = {
      ...merchantData,
      id: 'm_' + Math.random().toString(36).substring(2, 9),
      qrisImage: merchantData.qrisImage || this.data.systemConfig?.qrisImage || '/qris-merchant.png',
      rating: 5.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (newMerchant.password && !newMerchant.password.startsWith('pbkdf2$')) {
      newMerchant.password = hashPassword(newMerchant.password);
    }

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('merchants', newMerchant.id, newMerchant);
      if (!persisted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal menyimpan merchant ke cloud Firestore. Transaksi dibatalkan demi menjaga integritas data.');
      }
    } else {
      safeFirestoreSetDoc('merchants', newMerchant.id, newMerchant);
    }

    this.data.merchants.push(newMerchant);
    this.save();
    this.log(userId, `Created merchant ${newMerchant.name}`, 'ADMIN');
    return newMerchant;
  }

  public async updateMerchant(userId: string, id: string, updates: Partial<Merchant>, role: 'ADMIN' | 'MERCHANT' = 'MERCHANT'): Promise<Merchant> {
    await this.ensureProductionCloudReady('Pembaruan Merchant');
    const index = this.data.merchants.findIndex(m => m.id === id);
    if (index === -1) throw new Error('Merchant not found');

    const prevMerchant = { ...this.data.merchants[index] };
    const updatedData = { ...updates };
    if (updatedData.password && !updatedData.password.startsWith('pbkdf2$')) {
      updatedData.password = hashPassword(updatedData.password);
    }

    if (updatedData.qrisImage !== undefined) {
      updatedData.qrisUpdatedAt = new Date().toISOString();
    }

    const nextMerchant = {
      ...this.data.merchants[index],
      ...updatedData,
      updatedAt: new Date().toISOString()
    };

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('merchants', id, nextMerchant);
      if (!persisted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal memperbarui merchant pada cloud Firestore. Perubahan dibatalkan demi integritas data.');
      }
    } else {
      safeFirestoreSetDoc('merchants', id, nextMerchant);
    }

    this.data.merchants[index] = nextMerchant;
    this.save();
    this.log(userId, `Updated merchant ${this.data.merchants[index].name}`, role);
    return this.data.merchants[index];
  }

  public async deleteMerchant(userId: string, id: string): Promise<boolean> {
    await this.ensureProductionCloudReady('Penghapusan Merchant');
    const index = this.data.merchants.findIndex(m => m.id === id);
    if (index === -1) return false;

    if (foodConfig.isProduction) {
      const deleted = await safeAdminDeleteDoc('merchants', id);
      if (!deleted) {
        throw new Error('[Produksi] Gagal menghapus merchant pada cloud Firestore. Operasi dibatalkan demi integritas data.');
      }
    } else {
      safeAdminDeleteDoc('merchants', id);
    }

    const name = this.data.merchants[index].name;
    this.data.merchants.splice(index, 1);
    this.data.categories = this.data.categories.filter(c => c.merchantId !== id);
    this.data.menuItems = this.data.menuItems.filter(i => i.merchantId !== id);

    this.save();
    this.log(userId, `Deleted merchant ${name}`, 'ADMIN');
    return true;
  }

  public async activateMerchant(email: string, passwordPlain: string): Promise<{ success: boolean; merchant?: Merchant; error?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const merchant = this.data.merchants.find(m => m.email?.trim().toLowerCase() === cleanEmail);
    if (!merchant) {
      return { success: false, error: 'Merchant dengan email tersebut tidak ditemukan.' };
    }

    const prevMerchant = { ...merchant };
    merchant.active = true;
    merchant.isActivated = true;
    merchant.password = hashPassword(passwordPlain);
    merchant.updatedAt = new Date().toISOString();

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('merchants', merchant.id, merchant);
      if (!persisted) {
        Object.assign(merchant, prevMerchant);
        throw new Error('[Produksi] Gagal mengaktifkan merchant pada cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('merchants', merchant.id, merchant);
    }

    if (this.data.partnerRegistrations) {
      const reg = this.data.partnerRegistrations.find(r => r.email?.trim().toLowerCase() === cleanEmail && r.type === 'MERCHANT');
      if (reg) {
        reg.status = 'ACTIVATED';
        safeFirestoreSetDoc('partnerRegistrations', reg.id, reg);
      }
    }

    this.save();
    this.log(merchant.id, `Activated merchant store ${merchant.name}`, 'MERCHANT');
    return { success: true, merchant };
  }

  // --- CATEGORIES ---
  public getCategories(merchantId: string): Category[] {
    return this.data.categories
      .filter(c => c.merchantId === merchantId)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  }

  public async createCategory(merchantId: string, name: string): Promise<Category> {
    const existing = this.getCategories(merchantId);
    const orderIndex = existing.length > 0 ? Math.max(...existing.map(e => e.orderIndex)) + 1 : 1;
    const newCat: Category = {
      id: 'cat_' + Math.random().toString(36).substring(2, 9),
      merchantId,
      name: name.trim(),
      orderIndex
    };

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('categories', newCat.id, newCat);
      if (!persisted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal menyimpan kategori menu ke cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('categories', newCat.id, newCat);
    }

    this.data.categories.push(newCat);
    this.save();
    this.log(merchantId, `Created category ${name}`, 'MERCHANT');
    return newCat;
  }

  public async updateCategory(merchantId: string, id: string, name: string): Promise<Category> {
    const cat = this.data.categories.find(c => c.id === id && c.merchantId === merchantId);
    if (!cat) throw new Error('Category not found');
    const prevName = cat.name;
    cat.name = name.trim();

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('categories', id, cat);
      if (!persisted && foodConfig.isProduction) {
        cat.name = prevName;
        throw new Error('[Produksi] Gagal memperbarui kategori menu di cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('categories', id, cat);
    }

    this.save();
    return cat;
  }

  public async deleteCategory(merchantId: string, id: string): Promise<boolean> {
    const index = this.data.categories.findIndex(c => c.id === id && c.merchantId === merchantId);
    if (index === -1) return false;

    if (isFirestoreAdminConfigured()) {
      const deleted = await safeAdminDeleteDoc('categories', id);
      if (!deleted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal menghapus kategori menu pada cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeAdminDeleteDoc('categories', id);
    }

    this.data.categories.splice(index, 1);
    this.data.menuItems = this.data.menuItems.filter(i => i.categoryId !== id);
    this.save();
    return true;
  }

  // --- MENU ITEMS ---
  public getMenuItemsByMerchant(merchantId: string): MenuItem[] {
    return this.data.menuItems.filter(i => i.merchantId === merchantId);
  }

  public getMenuItemById(id: string): MenuItem | undefined {
    return this.data.menuItems.find(i => i.id === id);
  }

  public async createMenuItem(merchantId: string, itemData: Omit<MenuItem, 'id' | 'merchantId' | 'createdAt' | 'updatedAt'>): Promise<MenuItem> {
    const newItem: MenuItem = {
      ...itemData,
      id: 'item_' + Math.random().toString(36).substring(2, 9),
      merchantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('menuItems', newItem.id, newItem);
      if (!persisted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal menyimpan item menu ke cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('menuItems', newItem.id, newItem);
    }

    this.data.menuItems.push(newItem);
    this.save();
    this.log(merchantId, `Created menu item ${newItem.name}`, 'MERCHANT');
    return newItem;
  }

  public async updateMenuItem(merchantId: string, id: string, updates: Partial<MenuItem>): Promise<MenuItem> {
    const index = this.data.menuItems.findIndex(i => i.id === id && i.merchantId === merchantId);
    if (index === -1) throw new Error('Menu item not found');

    const prevItem = { ...this.data.menuItems[index] };
    const nextItem = {
      ...this.data.menuItems[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('menuItems', id, nextItem);
      if (!persisted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal memperbarui item menu pada cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('menuItems', id, nextItem);
    }

    this.data.menuItems[index] = nextItem;
    this.save();
    this.log(merchantId, `Updated menu item ${this.data.menuItems[index].name}`, 'MERCHANT');
    return this.data.menuItems[index];
  }

  public async deleteMenuItem(merchantId: string, id: string): Promise<boolean> {
    const index = this.data.menuItems.findIndex(i => i.id === id && i.merchantId === merchantId);
    if (index === -1) return false;

    if (isFirestoreAdminConfigured()) {
      const deleted = await safeAdminDeleteDoc('menuItems', id);
      if (!deleted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal menghapus item menu pada cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeAdminDeleteDoc('menuItems', id);
    }

    const name = this.data.menuItems[index].name;
    this.data.menuItems.splice(index, 1);
    this.save();
    this.log(merchantId, `Deleted menu item ${name}`, 'MERCHANT');
    return true;
  }

  // --- DRIVERS ---
  public getDrivers(): Driver[] {
    return this.data.drivers.map(d => {
      const { password, ...safe } = d as any;
      return safe as Driver;
    });
  }

  public getDriverById(id: string): Driver | undefined {
    const d = this.data.drivers.find(d => d.id === id);
    if (!d) return undefined;
    const { password, ...safe } = d as any;
    return safe as Driver;
  }

  public getDriverByEmailOrPhone(identifier: string): Driver | undefined {
    if (!identifier || !this.data || !Array.isArray(this.data.drivers)) return undefined;
    const clean = identifier.trim().toLowerCase();
    const rawClean = identifier.trim();
    const cleanPhone = identifier.replace(/[^0-9]/g, '');
    const altPhone = cleanPhone.startsWith('62') 
      ? '0' + cleanPhone.slice(2) 
      : (cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : '');

    return this.data.drivers.find(d => {
      if (!d) return false;
      const dId = typeof d.id === 'string' ? d.id.toLowerCase() : '';
      const dEmail = typeof d.email === 'string' ? d.email.trim().toLowerCase() : '';
      const dPhone = typeof d.phone === 'string' ? d.phone.trim() : '';
      const dPhoneNumbers = dPhone.replace(/[^0-9]/g, '');

      const matchId = Boolean(dId && dId === clean);
      const matchEmail = Boolean(dEmail && dEmail === clean);
      const matchPhoneExact = Boolean(dPhone && (dPhone === rawClean || dPhone.toLowerCase() === clean));
      const matchCleanPhone = Boolean(cleanPhone.length >= 8 && dPhoneNumbers && (
        dPhoneNumbers === cleanPhone || 
        (altPhone && dPhoneNumbers === altPhone)
      ));

      return matchId || matchEmail || matchPhoneExact || matchCleanPhone;
    });
  }

  public async createDriver(userId: string, driverData: Omit<Driver, 'id' | 'createdAt' | 'updatedAt'>): Promise<Driver> {
    await this.ensureProductionCloudReady('Pendaftaran Driver');
    const newDriver: Driver = {
      ...driverData,
      id: 'd_' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('drivers', newDriver.id, newDriver);
      if (!persisted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal menyimpan driver ke cloud Firestore. Transaksi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('drivers', newDriver.id, newDriver);
    }

    this.data.drivers.push(newDriver);
    this.save();
    this.log(userId, `Created driver ${newDriver.name}`, 'ADMIN');
    return newDriver;
  }

  public async updateDriver(userId: string, id: string, updates: Partial<Driver>, role: 'ADMIN' | 'DRIVER' = 'DRIVER'): Promise<Driver> {
    await this.ensureProductionCloudReady('Pembaruan Driver');
    const index = this.data.drivers.findIndex(d => d.id === id);
    if (index === -1) throw new Error('Driver not found');

    const prevDriver = { ...this.data.drivers[index] };
    const nextDriver = {
      ...this.data.drivers[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('drivers', id, nextDriver);
      if (!persisted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal memperbarui driver pada cloud Firestore. Perubahan dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('drivers', id, nextDriver);
    }

    this.data.drivers[index] = nextDriver;
    this.save();
    this.log(userId, `Updated driver ${this.data.drivers[index].name}`, role);
    return this.data.drivers[index];
  }

  public async deleteDriver(userId: string, id: string): Promise<boolean> {
    await this.ensureProductionCloudReady('Penghapusan Driver');
    const index = this.data.drivers.findIndex(d => d.id === id);
    if (index === -1) return false;

    if (isFirestoreAdminConfigured()) {
      const deleted = await safeAdminDeleteDoc('drivers', id);
      if (!deleted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal menghapus driver pada cloud Firestore. Operasi dibatalkan.');
      }
    } else {
      safeAdminDeleteDoc('drivers', id);
    }

    const name = this.data.drivers[index].name;
    this.data.drivers.splice(index, 1);
    this.save();
    this.log(userId, `Deleted driver ${name}`, 'ADMIN');
    return true;
  }

  // --- ORDERS ---
  public getOrders(): Order[] {
    this.reloadFromDiskIfNeeded();
    return this.data.orders.map(o => normalizeOrderDeliveryFee(o));
  }

  public getOrderById(id: string): Order | undefined {
    if (!id) return undefined;
    const cleanId = String(id).trim();
    if (!cleanId) return undefined;

    // Remove optional leading # and whitespace
    const rawClean = cleanId.replace(/^#/, '').trim();
    const cleanLower = rawClean.toLowerCase();
    const cleanUpper = rawClean.toUpperCase();
    const withoutOrd = cleanLower.startsWith('ord_') ? cleanLower.replace(/^ord_/, '') : cleanLower;
    const withOrd = cleanLower.startsWith('ord_') ? cleanLower : 'ord_' + cleanLower;
    const withoutTf = cleanUpper.startsWith('TF-') ? cleanUpper.replace(/^TF-/, '') : cleanUpper;
    const withTf = cleanUpper.startsWith('TF-') ? cleanUpper : 'TF-' + cleanUpper;

    const matcher = (item: Order | null | undefined): boolean => {
      if (!item) return false;
      const itemId = String(item.id || '').trim();
      const itemLower = itemId.toLowerCase();
      const itemUpper = itemId.toUpperCase();
      const itemOrderNumber = String(item.orderNumber || '').trim();
      const numUpper = itemOrderNumber.toUpperCase();

      // 1. Direct or normalized match on canonical orderNumber
      if (itemOrderNumber && (
        itemOrderNumber === rawClean ||
        numUpper === cleanUpper ||
        numUpper === withTf ||
        numUpper.replace(/^TF-/, '') === withoutTf
      )) {
        return true;
      }

      // 2. Direct or normalized match on internal database id
      if (
        itemId === rawClean ||
        itemLower === cleanLower ||
        itemLower === withoutOrd ||
        itemLower === withOrd ||
        itemLower.replace(/^ord_/, '') === withoutOrd
      ) {
        return true;
      }

      // 3. Match suffix (e.g. last 4-6 chars of ID or orderNumber)
      if (rawClean.length >= 4) {
        if (itemUpper.endsWith(cleanUpper) || (itemUpper.replace(/^ORD_/, '').endsWith(cleanUpper))) {
          return true;
        }
        if (numUpper.endsWith(cleanUpper) || (numUpper.replace(/^TF-/, '').endsWith(cleanUpper))) {
          return true;
        }
      }

      return false;
    };

    let o = this.data.orders.find(matcher);

    if (!o) {
      // Reload from disk in case order was created/updated by another serverless instance or worker
      const reloaded = this.reloadFromDiskIfNeeded();
      if (reloaded) {
        o = this.data.orders.find(matcher);
      }
    }

    return o ? normalizeOrderDeliveryFee(o) : undefined;
  }

  public getOrdersByMerchant(merchantId: string): Order[] {
    this.reloadFromDiskIfNeeded();
    if (!merchantId) return [];
    const cleanTarget = String(merchantId).trim().toLowerCase();
    const stripPrefix = (str: string) => str.replace(/^merchant_/, '');
    const cleanTargetBase = stripPrefix(cleanTarget);

    return this.data.orders
      .filter(o => {
        if (!o) return false;
        const oMerchantId = String(o.merchantId || '').trim().toLowerCase();
        if (oMerchantId && (oMerchantId === cleanTarget || stripPrefix(oMerchantId) === cleanTargetBase)) {
          return true;
        }
        // Fallback: Check if items in order match the merchant
        if (Array.isArray(o.items) && o.items.length > 0) {
          const itemMatched = o.items.some(item => {
            const mi = this.data.menuItems.find(m => m.id === item.menuItemId);
            if (mi && mi.merchantId) {
              const miMerchantId = String(mi.merchantId).trim().toLowerCase();
              return miMerchantId === cleanTarget || stripPrefix(miMerchantId) === cleanTargetBase;
            }
            return false;
          });
          if (itemMatched) return true;
        }
        return false;
      })
      .map(o => normalizeOrderDeliveryFee(o));
  }

  public async findOrdersByMerchant(merchantId: string): Promise<Order[]> {
    if (!merchantId) return [];
    let orders = this.getOrdersByMerchant(merchantId);

    // Sync from Firestore Admin if configured
    if (isFirestoreAdminConfigured()) {
      try {
        const remoteOrders = await safeAdminGetDocs('orders');
        if (Array.isArray(remoteOrders) && remoteOrders.length > 0) {
          let updatedAny = false;
          for (const ro of remoteOrders) {
            if (!ro || !ro.id) continue;
            const existingIdx = this.data.orders.findIndex(o => o.id === ro.id);
            if (existingIdx === -1) {
              this.data.orders.unshift(ro as Order);
              updatedAny = true;
            } else {
              const localOrder = this.data.orders[existingIdx];
              if (ro.updatedAt && (!localOrder.updatedAt || new Date(ro.updatedAt).getTime() > new Date(localOrder.updatedAt).getTime())) {
                this.data.orders[existingIdx] = ro as Order;
                updatedAny = true;
              } else if (ro.status === OrderStatus.PAYMENT_VERIFIED && localOrder.status !== OrderStatus.PAYMENT_VERIFIED) {
                this.data.orders[existingIdx] = ro as Order;
                updatedAny = true;
              }
            }
          }
          if (updatedAny) {
            this.save();
            orders = this.getOrdersByMerchant(merchantId);
          }
        }
      } catch (err) {
        console.warn('[TumpangFood DB] Error during remote Firestore orders sync for merchant:', err);
      }
    }

    return orders;
  }

  public getOrdersByDriver(driverId: string): Order[] {
    this.reloadFromDiskIfNeeded();
    return this.data.orders.filter(o => o.driverId === driverId).map(o => normalizeOrderDeliveryFee(o));
  }

  public getAvailableOrdersForDrivers(): Order[] {
    this.reloadFromDiskIfNeeded();
    return this.data.orders.filter(o =>
      !o.driverId &&
      (o.status === OrderStatus.READY_FOR_PICKUP || o.status === OrderStatus.COOKING || o.status === OrderStatus.PAYMENT_VERIFIED) &&
      (o.paymentStatus === PaymentStatus.PAID || [OrderStatus.READY_FOR_PICKUP, OrderStatus.COOKING, OrderStatus.ORDER_PICKED_UP, OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(o.status))
    ).map(o => normalizeOrderDeliveryFee(o));
  }

  public async acceptDriverTask(driverId: string, orderId: string): Promise<Order> {
    this.reloadFromDiskIfNeeded();
    const cleanOrderId = String(orderId || '').trim();
    const cleanDriverId = String(driverId || '').trim();

    const driver = this.getDriverById(cleanDriverId);
    if (!driver) {
      throw new Error('Identitas kurir tidak ditemukan di sistem.');
    }
    if (!driver.online) {
      throw new Error('Status Anda sedang Offline. Aktifkan status Online terlebih dahulu untuk menerima tugas.');
    }
    if (!driver.active) {
      throw new Error('Akun kurir Anda dinonaktifkan oleh administrator.');
    }

    const orderIndex = this.data.orders.findIndex(o => o.id === cleanOrderId);
    if (orderIndex === -1) {
      throw new Error('Pesanan tidak ditemukan.');
    }

    const currentOrder = this.data.orders[orderIndex];

    // ATOMIC PRE-EMPTION GUARD: Prevent race condition between two drivers
    if (currentOrder.driverId && currentOrder.driverId !== cleanDriverId) {
      throw new Error(`Pesanan ini telah diambil oleh kurir lain (${currentOrder.driverName || 'Kurir Lain'}).`);
    }

    // Must be in acceptable operational state
    const validStatuses: OrderStatus[] = [
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.COOKING,
      OrderStatus.PAYMENT_VERIFIED
    ];

    if (!validStatuses.includes(currentOrder.status)) {
      throw new Error(`Pesanan dengan status ${currentOrder.status} tidak dapat diterima.`);
    }

    const updated = await this.updateOrder(cleanDriverId, cleanOrderId, {
      driverId: driver.id,
      driverName: driver.name
    }, 'DRIVER');

    this.log(cleanDriverId, `Kurir ${driver.name} (#${driver.id}) menerima tugas pengantaran #${cleanOrderId}`, 'DRIVER');
    return updated;
  }

  public getOrdersByCustomerPhone(phone: string): Order[] {
    this.reloadFromDiskIfNeeded();
    return this.data.orders.filter(o => o.customerPhone === phone).map(o => normalizeOrderDeliveryFee(o));
  }

  public async findOrder(id: string): Promise<Order | undefined> {
    if (!id) return undefined;
    const cleanId = String(id).trim();
    if (!cleanId) return undefined;

    // Stage 1: In-memory & local disk flexible lookup
    let order = this.getOrderById(cleanId);

    // Stage 2: Remote Cloud Firestore lookup if not found in memory or disk
    if (!order && isFirestoreAdminConfigured()) {
      try {
        const candidateKeys = Array.from(new Set([
          cleanId,
          cleanId.startsWith('ord_') ? cleanId.replace(/^ord_/, '') : 'ord_' + cleanId,
          cleanId.toLowerCase(),
          cleanId.startsWith('ord_') ? cleanId.toLowerCase() : 'ord_' + cleanId.toLowerCase()
        ]));

        for (const docKey of candidateKeys) {
          const remote = await safeAdminGetDoc('orders', docKey);
          if (remote) {
            order = remote as Order;
            if (!order.id) order.id = docKey;
            console.log(`[TumpangFood DB] Successfully retrieved order "${order.id}" directly from Firestore via key "${docKey}".`);
            const idx = this.data.orders.findIndex(o => o.id === order!.id || o.id === cleanId);
            if (idx >= 0) {
              this.data.orders[idx] = order;
            } else {
              this.data.orders.unshift(order);
            }
            this.save();
            break;
          }
        }
      } catch (e: any) {
        console.warn(`[TumpangFood DB] Query remote order ${cleanId} failed:`, e.message);
      }
    }

    if (order && (!order.merchantQrisImage || order.merchantQrisImage.includes('unsplash'))) {
      const merchant = this.getMerchantById(order.merchantId);
      if (merchant?.qrisImage) {
        order.merchantQrisImage = merchant.qrisImage;
      }
    }

    if (order && (order.paymentStatus === PaymentStatus.PAID || [OrderStatus.PAYMENT_VERIFIED, OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP, OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(order.status)) && !order.receipt) {
      const canonicalOrderCode = order.orderNumber || order.id;
      const cleanRef = String(canonicalOrderCode).replace(/^ord_/, '').replace(/^TF-/, '').toUpperCase();
      const receiptNumber = order.receiptNumber || `TG-RCP-${cleanRef}`;
      const issuedAt = order.paymentVerifiedAt || order.updatedAt || order.createdAt;
      order.receiptNumber = receiptNumber;
      order.receipt = {
        receiptNumber,
        orderId: order.id,
        orderNumber: canonicalOrderCode,
        issuedAt,
        confirmedBy: order.paymentVerifiedBy || 'Admin TumpangGo',
        paymentMethod: order.paymentMethod || 'MERCHANT_QRIS',
        transactionRef: order.artopayPaymentId || `QRIS-TG-${cleanRef}`,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        serviceFee: order.serviceFee,
        uniqueCode: order.uniqueCode || 0,
        total: order.total,
        customerName: order.customerName,
        merchantName: order.merchantName,
        status: 'PAID'
      };
    }
    return order ? normalizeOrderDeliveryFee(order) : undefined;
  }

  public async createOrder(rawInput: any): Promise<Order> {
    await this.ensureProductionCloudReady('Pembuatan Pesanan');
    const merchant = this.getMerchantById(rawInput.merchantId);
    if (!merchant) throw new Error('Toko / Merchant tidak ditemukan.');

    // 1. Idempotency Check (clientRequestId)
    if (rawInput.clientRequestId && String(rawInput.clientRequestId).trim().length > 0) {
      const cleanReqId = String(rawInput.clientRequestId).trim();
      const existingReq = this.data.orders.find(o => (o as any).clientRequestId === cleanReqId);
      if (existingReq) {
        return existingReq;
      }
    }

    // 2. Prevent duplicate orders submitted within 10 seconds with identical details
    const recentDuplicate = this.data.orders.find(o => 
      o.merchantId === rawInput.merchantId &&
      o.customerPhone === rawInput.customerPhone &&
      Date.now() - new Date(o.createdAt).getTime() < 10000 &&
      o.status === OrderStatus.WAITING_PAYMENT
    );
    if (recentDuplicate) {
      return recentDuplicate;
    }

    const activeUniqueCodes = this.data.orders
      .filter(o => o.status === OrderStatus.WAITING_PAYMENT || o.status === OrderStatus.WAITING_PAYMENT_VERIFICATION)
      .map(o => o.uniqueCode);

    const validatedOrderData = OrderService.validateAndBuildOrder(
      rawInput,
      merchant,
      this.data.menuItems,
      this.data.systemConfig,
      activeUniqueCodes
    );

    const now = new Date();
    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '');
    const dailyCount = this.data.orders.filter(o => o.createdAt && o.createdAt.startsWith(now.toISOString().slice(0, 10))).length + 1;
    let orderNumber = `TF-${datePrefix}-${String(dailyCount).padStart(3, '0')}`;
    let attempt = 0;
    while (this.data.orders.some(o => o.orderNumber === orderNumber)) {
      attempt++;
      orderNumber = `TF-${datePrefix}-${String(dailyCount + attempt).padStart(3, '0')}`;
    }

    const newOrder: Order = normalizeOrderDeliveryFee({
      ...validatedOrderData,
      id: 'ord_' + Math.random().toString(36).substring(2, 9),
      orderNumber,
      clientRequestId: rawInput.clientRequestId ? String(rawInput.clientRequestId).trim() : undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    if (foodConfig.isProduction) {
      const persisted = await safeFirestoreSetDoc('orders', newOrder.id, newOrder);
      if (!persisted) {
        throw new Error('[Produksi] Gagal menyimpan pesanan ke cloud Firestore. Transaksi dibatalkan secara aman demi mencegah kehilangan data atau transaksi ganda.');
      }
    }

    this.data.orders.unshift(newOrder);
    this.save();
    this.log('CUSTOMER', `Created order ${newOrder.orderNumber} (ID: ${newOrder.id}) Total: Rp ${newOrder.total.toLocaleString()} (UniqueCode: ${newOrder.uniqueCode})`, 'CUSTOMER');

    if (!foodConfig.isProduction) {
      if (isFirestoreAdminConfigured()) {
        safeFirestoreSetDoc('orders', newOrder.id, newOrder).catch(() => {});
      } else {
        console.warn('[TumpangFood DB] Variabel FIREBASE_SERVICE_ACCOUNT_KEY belum dikonfigurasi di Environment Variables Vercel. Pesanan disimpan pada penyimpanan lokal resilien.');
      }
    }
    return newOrder;
  }

  public async updateOrder(
    userId: string,
    id: string,
    updates: Partial<Order>,
    role: AppRole = 'SYSTEM'
  ): Promise<Order> {
    const cleanId = String(id || '').trim();
    let index = this.data.orders.findIndex(o => o.id === cleanId || (o.orderNumber && o.orderNumber === cleanId));
    if (index === -1) {
      const match = this.getOrderById(cleanId);
      if (match) {
        index = this.data.orders.findIndex(o => o.id === match.id);
      }
    }

    if (index === -1) {
      // Try reloading from disk or fetching from remote Firestore
      const fetched = await this.findOrder(cleanId);
      if (fetched) {
        index = this.data.orders.findIndex(o => o.id === fetched.id);
      }
    }

    if (index === -1) {
      console.warn(`[TumpangFood DB] updateOrder failed: Order not found for ID "${cleanId}". Total orders in memory: ${this.data.orders.length}`);
      throw new Error('Pesanan tidak ditemukan.');
    }

    const currentOrder = this.data.orders[index];
    const prevStatus = currentOrder.status;

    // Canonical identifiers are strictly immutable
    delete (updates as any).id;
    delete (updates as any).orderNumber;

    // Validate state transition if status is being updated
    if (updates.status && updates.status !== prevStatus) {
      const check = OrderService.isValidStatusTransition(prevStatus, updates.status, role);
      if (!check.allowed) {
        throw new Error(check.reason || 'Perubahan status pesanan tidak diizinkan.');
      }
    }

    // Customer or merchant cannot alter financials or item prices
    if (role !== 'ADMIN' && role !== 'MASTER_ADMIN' && role !== 'SYSTEM') {
      delete (updates as any).subtotal;
      delete (updates as any).deliveryFee;
      delete (updates as any).serviceFee;
      delete (updates as any).total;
      delete (updates as any).uniqueCode;
    }

    // Synchronize paymentStatus and timestamps
    if (updates.paymentProof && (!updates.paymentStatus || updates.paymentStatus === PaymentStatus.WAITING_VERIFICATION)) {
      updates.paymentStatus = PaymentStatus.WAITING_VERIFICATION;
      updates.status = OrderStatus.WAITING_PAYMENT_VERIFICATION;
      updates.paymentProofUploadedAt = updates.paymentProofUploadedAt || new Date().toISOString();
      updates.paymentRejectionReason = undefined;
    }

    if (updates.status === OrderStatus.PAYMENT_VERIFIED || updates.paymentStatus === PaymentStatus.PAID) {
      updates.paymentStatus = PaymentStatus.PAID;
      if (!updates.status || updates.status === OrderStatus.WAITING_PAYMENT || updates.status === OrderStatus.WAITING_PAYMENT_VERIFICATION) {
        updates.status = OrderStatus.PAYMENT_VERIFIED;
      }
      updates.paymentVerifiedAt = updates.paymentVerifiedAt || new Date().toISOString();
      if ((role === 'ADMIN' || role === 'MASTER_ADMIN' || role === 'SYSTEM') && userId) {
        updates.paymentVerifiedBy = userId;
      }
    }

    if (updates.status === OrderStatus.PAYMENT_REJECTED || updates.paymentStatus === PaymentStatus.REJECTED) {
      updates.paymentStatus = PaymentStatus.REJECTED;
      updates.status = OrderStatus.PAYMENT_REJECTED;
      if ((role === 'ADMIN' || role === 'MASTER_ADMIN' || role === 'SYSTEM') && userId) {
        updates.paymentVerifiedBy = userId;
      }
    }

    if (updates.status === OrderStatus.EXPIRED || updates.paymentStatus === PaymentStatus.EXPIRED) {
      updates.paymentStatus = PaymentStatus.EXPIRED;
      updates.status = OrderStatus.EXPIRED;
    }

    this.data.orders[index] = normalizeOrderDeliveryFee({
      ...currentOrder,
      ...updates,
      updatedAt: new Date().toISOString()
    });
    this.save();

    if (updates.status && updates.status !== prevStatus) {
      this.log(userId, `Updated order ${currentOrder.id} status from ${prevStatus} to ${updates.status}`, role);

      // Trigger Web Push notification to Merchant if status transitioned to PAYMENT_VERIFIED
      if (updates.status === OrderStatus.PAYMENT_VERIFIED) {
        import('./services/pushService').then(m => {
          m.pushService.notifyNewVerifiedOrder(this.data.orders[index]);
        }).catch(() => {});
      }

      // Auto-assign driver when payment is verified or ready for pickup if unassigned and configured
      if (
        (updates.status === OrderStatus.PAYMENT_VERIFIED || updates.status === OrderStatus.READY_FOR_PICKUP) &&
        !this.data.orders[index].driverId &&
        this.data.systemConfig.assignmentMode === AssignmentMode.AUTOMATIC
      ) {
        await this.autoAssignDriver(currentOrder.id);
      }
    } else {
      this.log(userId, `Updated order ${currentOrder.id} details`, role);
    }

    // Trigger Web Push notification to Driver if driverId was newly assigned
    if (updates.driverId && updates.driverId !== currentOrder.driverId) {
      import('./services/pushService').then(m => {
        m.pushService.notifyDriverAssignedOrder(updates.driverId!, this.data.orders[index]);
      }).catch(() => {});
    }

    if (foodConfig.isProduction) {
      await this.ensureProductionCloudReady('Pembaruan Pesanan');
      const persisted = await safeFirestoreSetDoc('orders', currentOrder.id, this.data.orders[index]);
      if (!persisted) {
        this.data.orders[index] = currentOrder;
        this.save();
        throw new Error('Gagal memperbarui status pesanan pada cloud Firestore. Perubahan status dibatalkan demi integritas data.');
      }
    } else {
      if (isFirestoreAdminConfigured()) {
        safeFirestoreSetDoc('orders', currentOrder.id, this.data.orders[index]).catch(() => {});
      } else {
        console.warn('[TumpangFood DB] Variabel FIREBASE_SERVICE_ACCOUNT_KEY belum dikonfigurasi. Perubahan status disimpan pada penyimpanan lokal.');
      }
    }
    return this.data.orders[index];
  }

  public async verifyOrderPayment(adminId: string, orderId: string): Promise<Order> {
    const cleanId = String(orderId || '').trim();
    console.log(`[TumpangFood DB] verifyOrderPayment starting for orderId: "${cleanId}" by admin: "${adminId}"`);
    const order = await this.findOrder(cleanId);
    if (!order) {
      console.warn(`[TumpangFood DB] verifyOrderPayment failed: Order not found for ID "${cleanId}". Available orders in memory: ${this.data.orders.length}`);
      throw new Error('Pesanan tidak ditemukan.');
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new Error('Pesanan yang telah dibatalkan tidak dapat diverifikasi.');
    }
    if (order.status === OrderStatus.EXPIRED) {
      throw new Error('Pesanan telah kedaluwarsa. Pembayaran kedaluwarsa tidak dapat diverifikasi secara otomatis.');
    }

    const receiptNumber = order.receiptNumber || `TG-RCP-${String(order.id).replace(/^ord_/, '').toUpperCase()}`;
    const issuedAt = order.paymentVerifiedAt || new Date().toISOString();
    const transactionRef = order.artopayPaymentId || `QRIS-TG-${String(order.id).replace(/^ord_/, '').toUpperCase()}`;
    const receipt: OrderReceipt = order.receipt || {
      receiptNumber,
      orderId: order.id,
      issuedAt,
      confirmedBy: adminId || 'admin_tumpang',
      paymentMethod: order.paymentMethod || 'MERCHANT_QRIS',
      transactionRef,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      serviceFee: order.serviceFee,
      uniqueCode: order.uniqueCode || 0,
      total: order.total,
      customerName: order.customerName,
      merchantName: order.merchantName,
      status: 'PAID'
    };

    if (order.paymentStatus === PaymentStatus.PAID && order.status === OrderStatus.PAYMENT_VERIFIED && order.receipt) {
      return order; // Idempotent: already verified with existing receipt
    }

    const updated = await this.updateOrder(
      adminId,
      order.id,
      {
        status: OrderStatus.PAYMENT_VERIFIED,
        paymentStatus: PaymentStatus.PAID,
        paymentVerifiedAt: issuedAt,
        paymentVerifiedBy: adminId,
        receiptNumber,
        receipt
      },
      'ADMIN'
    );
    this.log(adminId, `Admin ${adminId} memverifikasi pembayaran LUNAS & menerbitkan receipt #${receiptNumber} untuk pesanan #${order.id} (Total: Rp ${order.total.toLocaleString('id-ID')})`, 'ADMIN');
    return updated;
  }

  public async rejectOrderPayment(adminId: string, orderId: string, reason: string): Promise<Order> {
    const cleanId = String(orderId || '').trim();
    console.log(`[TumpangFood DB] rejectOrderPayment starting for orderId: "${cleanId}" by admin: "${adminId}"`);
    const order = await this.findOrder(cleanId);
    if (!order) {
      console.warn(`[TumpangFood DB] rejectOrderPayment failed: Order not found for ID "${cleanId}". Available orders in memory: ${this.data.orders.length}`);
      throw new Error('Pesanan tidak ditemukan.');
    }
    if (!reason || !reason.trim()) {
      throw new Error('Alasan penolakan bukti pembayaran wajib diisi.');
    }
    const cleanReason = reason.trim();

    const updated = await this.updateOrder(
      adminId,
      order.id,
      {
        status: OrderStatus.PAYMENT_REJECTED,
        paymentStatus: PaymentStatus.REJECTED,
        paymentRejectionReason: cleanReason,
        cancelReason: cleanReason,
        paymentVerifiedBy: adminId
      },
      'ADMIN'
    );
    this.log(adminId, `Admin ${adminId} menolak bukti pembayaran pesanan #${order.id}. Alasan: ${cleanReason}`, 'ADMIN');
    return updated;
  }

  public async autoAssignDriver(orderId: string): Promise<void> {
    const cleanId = String(orderId || '').trim();
    const order = await this.findOrder(cleanId);
    if (!order) return;

    const availableDrivers = this.data.drivers.filter(d => d.online && d.active);
    if (availableDrivers.length === 0) {
      this.log('SYSTEM', `No active drivers available for auto-assignment of order ${orderId}`, 'SYSTEM');
      return;
    }

    // Assign to driver with least active tasks
    const driverTaskCounts = availableDrivers.map(d => {
      const activeTasks = this.data.orders.filter(o =>
        o.driverId === d.id &&
        [OrderStatus.PAYMENT_VERIFIED, OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP].includes(o.status)
      ).length;
      return { driver: d, count: activeTasks };
    });

    driverTaskCounts.sort((a, b) => a.count - b.count);
    const selectedDriver = driverTaskCounts[0].driver;

    await this.updateOrder('SYSTEM', orderId, {
      driverId: selectedDriver.id,
      driverName: selectedDriver.name
    }, 'SYSTEM');
  }

  public async manualAssignDriver(userId: string, orderId: string, driverId: string): Promise<Order> {
    const driver = this.getDriverById(driverId);
    if (!driver) throw new Error('Driver not found');

    const updated = await this.updateOrder(userId, orderId, {
      driverId: driver.id,
      driverName: driver.name
    }, 'ADMIN');

    this.log(userId, `Assigned driver ${driver.name} to order ${orderId}`, 'ADMIN');
    return updated;
  }

  // --- SETTLEMENTS ---
  public getSettlements(): Settlement[] {
    return this.data.settlements;
  }

  public getSettlementsByMerchant(merchantId: string): Settlement[] {
    return this.data.settlements.filter(s => s.merchantId === merchantId);
  }

  private settlementMutex: Promise<any> = Promise.resolve();

  /**
   * Serializes settlement operations across the process and host instances to prevent concurrent double-settlements
   */
  public async runWithSettlementLock<T>(fn: () => Promise<T> | T): Promise<T> {
    let release: () => void;
    const waitPromise = new Promise<void>(resolve => {
      release = resolve;
    });
    const currentMutex = this.settlementMutex;
    this.settlementMutex = currentMutex.then(() => waitPromise).catch(() => waitPromise);
    await currentMutex;

    // Cross-process filesystem atomic lock (guards separate Node processes)
    const lockPath = path.join(path.dirname(FOOD_DB_FILE), 'settlement_operation.lock');
    let fileLockAcquired = false;
    for (let attempts = 0; attempts < 30; attempts++) {
      try {
        const fd = fs.openSync(lockPath, 'wx');
        fs.writeSync(fd, `${process.pid}:${Date.now()}`);
        fs.closeSync(fd);
        fileLockAcquired = true;
        break;
      } catch (err: any) {
        if (err.code === 'EEXIST') {
          try {
            const stats = fs.statSync(lockPath);
            if (Date.now() - stats.mtimeMs > 15000) {
              fs.unlinkSync(lockPath);
              continue;
            }
          } catch {
            // lock file was freed concurrently
          }
          await new Promise(r => setTimeout(r, 100));
        } else {
          break;
        }
      }
    }

    try {
      return await fn();
    } finally {
      if (fileLockAcquired) {
        try {
          fs.unlinkSync(lockPath);
        } catch {}
      }
      release!();
    }
  }

  public async createSettlement(
    userId: string,
    settlementData: { merchantId: string; orderIds?: string[] } & Partial<Settlement>
  ): Promise<Settlement> {
    return this.runWithSettlementLock(async () => {
      const targetOrderIds = settlementData.orderIds || [];
      if (!Array.isArray(targetOrderIds) || targetOrderIds.length === 0) {
        throw new Error('Settlement wajib menyertakan setidaknya satu ID pesanan yang memenuhi syarat.');
      }

      // Check merchant existence
      const merchant = this.data.merchants.find(m => m.id === settlementData.merchantId);
      if (!merchant) {
        throw new Error(`Merchant dengan ID "${settlementData.merchantId}" tidak ditemukan.`);
      }

      // 1. ATOMIC VALIDATION: Local state check
      const verifiedOrders: Order[] = [];
      for (const ordId of targetOrderIds) {
        const ord = this.data.orders.find(o => o.id === ordId);
        if (!ord) {
          throw new Error(`Pesanan "${ordId}" tidak ditemukan dalam database.`);
        }
        if (ord.merchantId !== settlementData.merchantId) {
          throw new Error(`Pesanan "${ordId}" bukan milik merchant ${settlementData.merchantId}.`);
        }
        if (ord.status !== OrderStatus.COMPLETED) {
          throw new Error(`Pesanan "${ordId}" belum selesai (status: ${ord.status}). Hanya pesanan COMPLETED yang dapat dicairkan.`);
        }
        if ((ord as any).isSettled === true || (ord as any).settlementId) {
          throw new Error(`Pesanan "${ordId}" sudah pernah dicairkan dalam settlement sebelumnya. Pencairan ganda dicegah secara atomik.`);
        }
        verifiedOrders.push(ord);
      }

      // 2. AUTHORITATIVE SERVER-SIDE RECALCULATION
      const orderCount = verifiedOrders.length;
      const totalSales = verifiedOrders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
      const commissionPercent = this.data.systemConfig.commissionPercent || 10;
      const totalCommission = Math.round((totalSales * commissionPercent) / 100);
      const amountToPay = Math.max(0, totalSales - totalCommission);

      const settlementId = 'set_' + Math.random().toString(36).substring(2, 9);
      const nowIso = new Date().toISOString();

      const newSettlement: Settlement = {
        id: settlementId,
        merchantId: merchant.id,
        merchantName: merchant.name,
        orderCount,
        totalSales,
        totalCommission,
        amountToPay,
        status: settlementData.status || SettlementStatus.WAITING_CONFIRMATION,
        bankName: settlementData.bankName || merchant.bankName || 'Bank Mandiri',
        bankAccount: settlementData.bankAccount || merchant.bankAccount || '-',
        bankHolder: settlementData.bankHolder || merchant.bankHolder || merchant.ownerName,
        createdAt: nowIso
      };

      // 3. DISTRIBUTED CLOUD TRANSACTION (Cross-instance & cross-container ACID isolation)
      const adminDb = getAdminDb();
      if (adminDb) {
        try {
          await runAdminTransaction(async (transaction) => {
            // Transactional Read: verify no order is settled in remote cloud Firestore
            for (const ordId of targetOrderIds) {
              const orderRef = adminDb.collection('orders').doc(ordId);
              const remoteSnap = await transaction.get(orderRef);
              if (remoteSnap.exists) {
                const remoteData = remoteSnap.data();
                if (remoteData?.isSettled === true || remoteData?.settlementId) {
                  throw new Error(`Pesanan "${ordId}" telah dicairkan oleh instance backend lain. Pencairan ganda lintas-instance dicegah secara atomik.`);
                }
              }
            }

            // Transactional Write: update orders
            for (const ord of verifiedOrders) {
              const orderRef = adminDb.collection('orders').doc(ord.id);
              transaction.set(orderRef, removeUndefinedFields({
                ...ord,
                isSettled: true,
                settlementId: settlementId,
                settledAt: nowIso,
                updatedAt: nowIso
              }), { merge: true });
            }

            // Transactional Write: create settlement document
            const settlementRef = adminDb.collection('settlements').doc(newSettlement.id);
            transaction.set(settlementRef, removeUndefinedFields(newSettlement));
          });
        } catch (txErr: any) {
          if (txErr.message && txErr.message.includes('telah dicairkan')) {
            throw txErr;
          }
          if (foodConfig.isProduction) {
            throw new Error(`[Produksi] Transaksi cloud Firestore gagal: ${txErr.message}. Pencairan dibatalkan demi menjaga integritas data keuangan.`);
          }
          console.warn('[TumpangFood DB] Distributed Firestore Admin transaction fallback in development mode:', txErr.message);
        }
      } else if (foodConfig.isProduction) {
        throw new Error('[Produksi] Firebase Admin Firestore wajib aktif dan terhubung untuk memproses pencairan dana (settlement).');
      }

      // 4. LOCAL COMMIT: Mark all orders as settled and attach settlementId
      for (const ord of verifiedOrders) {
        (ord as any).isSettled = true;
        (ord as any).settlementId = settlementId;
        (ord as any).settledAt = nowIso;
        (ord as any).updatedAt = nowIso;
        safeFirestoreSetDoc('orders', ord.id, ord);
      }

      this.data.settlements.unshift(newSettlement);
      this.save();
      this.createBackup();

      this.log(
        userId,
        `Created settlement ${settlementId} of Rp ${amountToPay.toLocaleString()} for ${merchant.name} (${orderCount} pesanan)`,
        'ADMIN'
      );

      safeFirestoreSetDoc('settlements', newSettlement.id, newSettlement);
      return newSettlement;
    });
  }

  public async updateSettlement(userId: string, id: string, updates: Partial<Settlement>): Promise<Settlement> {
    await this.ensureProductionCloudReady('Pembaruan Settlement');
    const index = this.data.settlements.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Settlement not found');

    const nextSettlement = {
      ...this.data.settlements[index],
      ...updates,
      paidAt: updates.status === SettlementStatus.SETTLEMENT_COMPLETED ? new Date().toISOString() : this.data.settlements[index].paidAt
    };

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('settlements', id, nextSettlement);
      if (!persisted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal memperbarui settlement di cloud Firestore. Perubahan dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('settlements', id, nextSettlement);
    }

    this.data.settlements[index] = nextSettlement;
    this.save();
    this.createBackup();
    this.log(userId, `Updated settlement ${id} to status ${this.data.settlements[index].status}`, 'ADMIN');
    return this.data.settlements[index];
  }

  public async confirmSettlement(userId: string, id: string): Promise<Settlement> {
    return this.updateSettlement(userId, id, { status: SettlementStatus.SETTLEMENT_COMPLETED });
  }

  public async generateHPlusOneSettlements(userId: string): Promise<Settlement[]> {
    return this.runWithSettlementLock(async () => {
      // Filter orders strictly completed and not yet settled
      const targetOrders = this.data.orders.filter(
        o => o.status === OrderStatus.COMPLETED && !(o as any).isSettled && !(o as any).settlementId
      );
      if (targetOrders.length === 0) return [];

      const grouped = new Map<string, Order[]>();
      for (const o of targetOrders) {
        const list = grouped.get(o.merchantId) || [];
        list.push(o);
        grouped.set(o.merchantId, list);
      }

      const createdSettlements: Settlement[] = [];
      const commissionPercent = this.data.systemConfig.commissionPercent || 10;
      const nowIso = new Date().toISOString();

      for (const [merchantId, orders] of grouped.entries()) {
        const merchant = this.data.merchants.find(m => m.id === merchantId);
        if (!merchant) continue;

        const orderCount = orders.length;
        const totalSales = orders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
        const totalCommission = Math.round((totalSales * commissionPercent) / 100);
        const amountToPay = Math.max(0, totalSales - totalCommission);

        const settlementId = 'set_' + Math.random().toString(36).substring(2, 9);
        const newSettlement: Settlement = {
          id: settlementId,
          merchantId,
          merchantName: merchant.name,
          orderCount,
          totalSales,
          totalCommission,
          amountToPay,
          status: SettlementStatus.WAITING_CONFIRMATION,
          bankName: merchant.bankName || 'Bank Mandiri',
          bankAccount: merchant.bankAccount || '-',
          bankHolder: merchant.bankHolder || merchant.ownerName,
          createdAt: nowIso
        };

        const adminDb = getAdminDb();
        if (adminDb) {
          try {
            await runAdminTransaction(async (transaction) => {
              for (const o of orders) {
                const orderRef = adminDb.collection('orders').doc(o.id);
                const snap = await transaction.get(orderRef);
                if (snap.exists) {
                  const data = snap.data();
                  if (data?.isSettled === true || data?.settlementId) {
                    throw new Error(`Order ${o.id} already settled.`);
                  }
                }
              }
              for (const o of orders) {
                const orderRef = adminDb.collection('orders').doc(o.id);
                transaction.set(orderRef, removeUndefinedFields({
                  ...o,
                  isSettled: true,
                  settlementId,
                  settledAt: nowIso,
                  updatedAt: nowIso
                }), { merge: true });
              }
              const settlementRef = adminDb.collection('settlements').doc(newSettlement.id);
              transaction.set(settlementRef, removeUndefinedFields(newSettlement));
            });
          } catch (txErr: any) {
            if (foodConfig.isProduction) {
              throw new Error(`[Produksi] Transaksi cloud Firestore gagal untuk merchant ${merchantId}: ${txErr.message}`);
            }
            console.warn(`[TumpangFood DB] H+1 atomic transaction fallback for ${merchantId}:`, txErr.message);
          }
        } else if (foodConfig.isProduction) {
          throw new Error('[Produksi] Firebase Admin Firestore wajib aktif untuk membuat H+1 settlements.');
        }

        for (const o of orders) {
          (o as any).isSettled = true;
          (o as any).settlementId = settlementId;
          (o as any).settledAt = nowIso;
          (o as any).updatedAt = nowIso;
          safeFirestoreSetDoc('orders', o.id, o);
        }

        this.data.settlements.unshift(newSettlement);
        safeFirestoreSetDoc('settlements', newSettlement.id, newSettlement);
        createdSettlements.push(newSettlement);
      }

      this.save();
      this.createBackup();
      this.log(userId, `Generated H+1 settlements for ${createdSettlements.length} merchants`, 'ADMIN');
      return createdSettlements;
    });
  }

  // --- PARTNER REGISTRATIONS ---
  public getPartnerRegistrations(): PartnerRegistration[] {
    return this.data.partnerRegistrations;
  }

  public async createPartnerRegistration(regData: Omit<PartnerRegistration, 'id' | 'status' | 'createdAt'>): Promise<PartnerRegistration> {
    const newReg: PartnerRegistration = {
      ...regData,
      id: 'reg_' + Math.random().toString(36).substring(2, 9),
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('partnerRegistrations', newReg.id, newReg);
      if (!persisted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal menyimpan pendaftaran mitra ke cloud Firestore. Transaksi dibatalkan.');
      }
    } else {
      safeFirestoreSetDoc('partnerRegistrations', newReg.id, newReg);
    }

    this.data.partnerRegistrations.push(newReg);
    this.save();
    this.log('CUSTOMER', `Submitted partner registration for ${newReg.name} (${newReg.type})`, 'CUSTOMER');
    return newReg;
  }

  public async approvePartnerRegistration(userId: string, id: string): Promise<{ success: boolean; error?: string; registration?: PartnerRegistration }> {
    const reg = this.data.partnerRegistrations.find(r => r.id === id);
    if (!reg) return { success: false, error: 'Registration not found' };
    if (reg.status !== 'PENDING') return { success: false, error: 'Registration already processed' };

    const prevStatus = reg.status;
    reg.status = 'APPROVED';

    if (reg.type === 'MERCHANT') {
      const generatedPassword = 'TF-' + Math.floor(1000 + Math.random() * 9000);
      reg.password = generatedPassword;

      const newMerchant = await this.createMerchant(userId, {
        name: reg.storeName || (reg.name + ' Store'),
        ownerName: reg.name,
        phone: reg.phone,
        address: reg.storeAddress || 'Alamat Toko',
        latitude: reg.latitude || -7.9482,
        longitude: reg.longitude || 112.7612,
        openTime: '08:00',
        closeTime: '21:00',
        bankName: 'Bank BRI',
        bankAccount: '1234567890',
        bankHolder: reg.name,
        active: true,
        cookTimeEstimate: '15-30 min',
        image: reg.businessPhoto || 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3',
        description: 'Toko baru bergabung di Tumpang Food!',
        category: reg.category || 'Nasi & Lauk',
        email: reg.email,
        isActivated: true,
        password: hashPassword(generatedPassword),
        businessPhoto: reg.businessPhoto,
        idPhoto: reg.idPhoto,
        contractPhoto: reg.contractPhoto
      });

      reg.storeId = newMerchant.id;

      // Add default category and item
      const defaultCategory = await this.createCategory(newMerchant.id, 'Menu Utama');
      await this.createMenuItem(newMerchant.id, {
        categoryId: defaultCategory.id,
        name: 'Nasi Goreng Spesial (Contoh)',
        description: 'Nasi goreng lezat dengan bumbu khas, telur, dan kerupuk.',
        price: 15000,
        available: true,
        image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&auto=format&fit=crop&q=60&ixlib=rb-4.0.3'
      });
    } else if (reg.type === 'DRIVER') {
      await this.createDriver(userId, {
        name: reg.name,
        phone: reg.phone,
        email: reg.email,
        active: true,
        online: false,
        latitude: -7.9482,
        longitude: 112.7612
      });
    }

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('partnerRegistrations', reg.id, reg);
      if (!persisted && foodConfig.isProduction) {
        reg.status = prevStatus;
        throw new Error('[Produksi] Gagal memperbarui status registrasi mitra ke cloud Firestore.');
      }
    } else {
      safeFirestoreSetDoc('partnerRegistrations', reg.id, reg);
    }

    this.save();
    this.log(userId, `Approved partner registration ${reg.id} (${reg.name})`, 'ADMIN');
    return { success: true, registration: reg };
  }

  public async rejectPartnerRegistration(userId: string, id: string): Promise<boolean> {
    const reg = this.data.partnerRegistrations.find(r => r.id === id);
    if (!reg) return false;
    const prevStatus = reg.status;
    reg.status = 'REJECTED';

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('partnerRegistrations', reg.id, reg);
      if (!persisted && foodConfig.isProduction) {
        reg.status = prevStatus;
        throw new Error('[Produksi] Gagal menolak pendaftaran mitra pada cloud Firestore.');
      }
    } else {
      safeFirestoreSetDoc('partnerRegistrations', reg.id, reg);
    }

    this.save();
    this.log(userId, `Rejected partner registration ${reg.id} (${reg.name})`, 'ADMIN');
    return true;
  }

  // --- REVIEW PENGGUNA TUMPANGGO / TESTIMONIALS ---
  public getPublishedTestimonials(categoryFilter?: string): Testimonial[] {
    if (!Array.isArray(this.data.testimonials)) return [];
    return this.data.testimonials
      .filter(t => {
        const isPublished = (t.status === 'published') && (t.consentApproved === true);
        if (!isPublished) return false;
        if (!categoryFilter || categoryFilter === 'all') return true;
        const normItemCat = (t.category === 'merchant' || t.category === 'umkm') ? 'merchant' : 'pelanggan';
        const normFilter = (categoryFilter === 'merchant' || categoryFilter === 'umkm') ? 'merchant' : categoryFilter;
        return normItemCat === normFilter;
      })
      .sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) {
          return (a.displayOrder || 0) - (b.displayOrder || 0);
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }

  public getAllTestimonials(filter?: { category?: string; status?: string }): Testimonial[] {
    if (!Array.isArray(this.data.testimonials)) return [];
    let list = [...this.data.testimonials];

    if (filter) {
      if (filter.category && filter.category !== 'all') {
        const normFilter = (filter.category === 'merchant' || filter.category === 'umkm') ? 'merchant' : filter.category;
        list = list.filter(t => {
          const normItemCat = (t.category === 'merchant' || t.category === 'umkm') ? 'merchant' : 'pelanggan';
          return normItemCat === normFilter;
        });
      }
      if (filter.status && filter.status !== 'all') {
        list = list.filter(t => t.status === filter.status);
      }
    }

    return list.sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) {
        return (a.displayOrder || 0) - (b.displayOrder || 0);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  public async createTestimonial(testimonialData: Omit<Testimonial, 'id' | 'createdAt'>): Promise<Testimonial> {
    if (!Array.isArray(this.data.testimonials)) this.data.testimonials = [];
    const now = new Date().toISOString();
    const rawCat = String(testimonialData.category || '').toLowerCase();
    const normalizedCategory: 'merchant' | 'pelanggan' = (rawCat === 'merchant' || rawCat === 'umkm') ? 'merchant' : 'pelanggan';
    const rawStatus = String(testimonialData.status || '').toLowerCase();
    const validStatus: 'draft' | 'pending' | 'published' | 'rejected' =
      ['published', 'pending', 'rejected', 'draft'].includes(rawStatus)
        ? (rawStatus as any)
        : 'pending';

    const parsedRating = testimonialData.rating !== undefined && testimonialData.rating !== null
      ? Math.min(5, Math.max(1, Math.round(Number(testimonialData.rating))))
      : undefined;

    const newTesti: Testimonial = {
      id: 'rev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      userName: (testimonialData.userName || '').trim(),
      merchantName: testimonialData.merchantName?.trim() || undefined,
      category: normalizedCategory,
      title: testimonialData.title?.trim() || undefined,
      content: (testimonialData.content || '').trim(),
      avatarUrl: testimonialData.avatarUrl?.trim() || undefined,
      roleDetail: testimonialData.roleDetail?.trim() || undefined,
      rating: parsedRating,
      consentApproved: Boolean(testimonialData.consentApproved),
      status: validStatus,
      displayOrder: Number(testimonialData.displayOrder) || 1,
      createdAt: now,
      updatedAt: now
    };

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('testimonials', newTesti.id, newTesti);
      if (!persisted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal menyimpan review ke cloud Firestore. Pengiriman ulasan dibatalkan demi menjaga integritas data.');
      }
    } else {
      await safeFirestoreSetDoc('testimonials', newTesti.id, newTesti);
    }

    this.data.testimonials.push(newTesti);
    this.save();
    return newTesti;
  }

  public async updateTestimonial(id: string, updates: Partial<Testimonial>): Promise<Testimonial | null> {
    if (!Array.isArray(this.data.testimonials)) return null;
    const index = this.data.testimonials.findIndex(t => t.id === id);
    if (index === -1) return null;

    const prev = this.data.testimonials[index];
    let category = prev.category;
    if (updates.category) {
      category = (updates.category === 'merchant' || updates.category === 'umkm') ? 'merchant' : 'pelanggan';
    }

    let rating = prev.rating;
    if (updates.rating !== undefined) {
      rating = updates.rating !== null && !isNaN(Number(updates.rating))
        ? Math.min(5, Math.max(1, Math.round(Number(updates.rating))))
        : undefined;
    }

    let status = prev.status;
    if (updates.status && ['published', 'pending', 'rejected', 'draft'].includes(updates.status)) {
      status = updates.status;
    }

    const updated: Testimonial = {
      ...prev,
      ...updates,
      merchantName: updates.merchantName !== undefined ? (updates.merchantName?.trim() || undefined) : prev.merchantName,
      title: updates.title !== undefined ? (updates.title?.trim() || undefined) : prev.title,
      category,
      rating,
      status,
      id: prev.id, // prevent ID overwrite
      createdAt: prev.createdAt,
      updatedAt: new Date().toISOString()
    };

    if (isFirestoreAdminConfigured()) {
      const persisted = await safeFirestoreSetDoc('testimonials', updated.id, updated);
      if (!persisted && foodConfig.isProduction) {
        throw new Error('[Produksi] Gagal memperbarui status review di cloud Firestore. Transaksi dibatalkan.');
      }
    } else {
      await safeFirestoreSetDoc('testimonials', updated.id, updated);
    }

    this.data.testimonials[index] = updated;
    this.save();
    return updated;
  }

  public async deleteTestimonial(id: string): Promise<boolean> {
    if (!Array.isArray(this.data.testimonials)) return false;
    const initialLen = this.data.testimonials.length;
    this.data.testimonials = this.data.testimonials.filter(t => t.id !== id);
    if (this.data.testimonials.length !== initialLen) {
      if (isFirestoreAdminConfigured()) {
        const deleted = await safeAdminDeleteDoc('testimonials', id);
        if (!deleted && foodConfig.isProduction) {
          throw new Error('[Produksi] Gagal menghapus review di cloud Firestore.');
        }
      } else {
        await safeAdminDeleteDoc('testimonials', id);
      }
      this.save();
      return true;
    }
    return false;
  }

  // --- WEB PUSH SUBSCRIPTIONS ---
  public savePushSubscription(sub: PushSubscriptionRecord): void {
    if (!this.data.pushSubscriptions) this.data.pushSubscriptions = [];
    const idx = this.data.pushSubscriptions.findIndex(s => s.subscription.endpoint === sub.subscription.endpoint);
    if (idx >= 0) {
      this.data.pushSubscriptions[idx] = {
        ...this.data.pushSubscriptions[idx],
        ...sub,
        updatedAt: new Date().toISOString()
      };
    } else {
      this.data.pushSubscriptions.push(sub);
    }
    this.save();
  }

  public removePushSubscription(endpoint: string): void {
    if (!this.data.pushSubscriptions) return;
    this.data.pushSubscriptions = this.data.pushSubscriptions.filter(s => s.subscription.endpoint !== endpoint);
    this.save();
  }

  public getPushSubscriptionsForEntity(role: 'MERCHANT' | 'DRIVER', entityId: string): PushSubscriptionRecord[] {
    if (!this.data.pushSubscriptions) return [];
    return this.data.pushSubscriptions.filter(s => s.role === role && s.entityId === entityId);
  }
}

export const foodDb = new FoodDatabase();
