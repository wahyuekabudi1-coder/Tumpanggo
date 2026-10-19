/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop - Independent Database Migration Engine
 * Handles automated schema migrations, audit of legacy database files,
 * data integrity verification, and non-destructive data seeding.
 */

import fs from 'fs';
import path from 'path';
import { shopEnv } from '../config/shopEnv';
import { ShopDatabaseSchema, ShopMigrationRecord } from './shopSchema';
import { ShopCategory, ShopProduct, ShopConfig } from '../../../types/shop';

export interface MigrationResult {
  success: boolean;
  appliedCount: number;
  migratedFromLegacy: boolean;
  legacyRecordsFound: number;
  message: string;
  timestamp: string;
}

export class ShopMigrationRunner {
  private targetDbPath: string;

  constructor(targetDbPath?: string) {
    this.targetDbPath = targetDbPath || shopEnv.database.filePath;
  }

  /**
   * Run all pending migrations on Shop Database
   */
  public async runMigrations(currentDb: ShopDatabaseSchema): Promise<{ updatedDb: ShopDatabaseSchema; result: MigrationResult }> {
    const appliedMigrations: ShopMigrationRecord[] = currentDb.migrations || [];
    let appliedCount = 0;
    let migratedFromLegacy = false;
    let legacyRecordsFound = 0;

    // Ensure migrations tracking array exists
    if (!currentDb.migrations) {
      currentDb.migrations = [];
    }

    // 1. Audit legacy database for any orphaned Shop records (Requirement 3)
    const legacyAudit = this.auditLegacyData();
    if (legacyAudit.hasShopData) {
      console.log(`[ShopMigration] Ditemukan ${legacyAudit.totalRecords} record Shop di database legacy. Menjalankan migrasi data...`);
      
      // Migrate categories from legacy if missing in shopDb
      for (const cat of legacyAudit.categories) {
        if (!currentDb.categories.some(c => c.id === cat.id)) {
          currentDb.categories.push(cat);
          legacyRecordsFound++;
        }
      }

      // Migrate products from legacy if missing in shopDb
      for (const prod of legacyAudit.products) {
        if (!currentDb.products.some(p => p.id === prod.id)) {
          currentDb.products.push(prod);
          legacyRecordsFound++;
        }
      }

      // Migrate orders from legacy if missing in shopDb
      for (const ord of legacyAudit.orders) {
        if (!currentDb.orders.some(o => o.id === ord.id)) {
          currentDb.orders.push(ord);
          legacyRecordsFound++;
        }
      }

      migratedFromLegacy = true;
    }

    // Migration V1: Baseline Schema Initialization
    if (!currentDb.migrations.some(m => m.version === 1)) {
      this.ensureBaselineData(currentDb);
      const v1Record: ShopMigrationRecord = {
        id: 'mig_001_baseline_schema',
        version: 1,
        name: 'Baseline Shop Marketplace Schema & Default Data',
        appliedAt: new Date().toISOString(),
        source: 'ShopMigrationRunner',
        notes: 'Initializes independent tables: config, categories, products, orders, shipments, auditLogs'
      };
      currentDb.migrations.push(v1Record);
      appliedCount++;
    }

    // Migration V2: Ensure SKU & Inventory Tracking fields
    if (!currentDb.migrations.some(m => m.version === 2)) {
      for (const p of currentDb.products) {
        if (!p.sku) {
          p.sku = `TS-${p.id.replace('sprod_', '').toUpperCase().substring(0, 6)}`;
        }
        if (p.stock === undefined || p.stock === null) {
          p.stock = 50;
        }
        if (!p.unit) {
          p.unit = 'pcs';
        }
      }
      const v2Record: ShopMigrationRecord = {
        id: 'mig_002_sku_inventory_integrity',
        version: 2,
        name: 'SKU and Inventory Integrity Backfill',
        appliedAt: new Date().toISOString(),
        source: 'ShopMigrationRunner',
        notes: 'Enforces non-null SKU and default stock limits on all active shop products'
      };
      currentDb.migrations.push(v2Record);
      appliedCount++;
    }

    // Migration V3: Courier Adapter & International Shipment Indexing
    if (!currentDb.migrations.some(m => m.version === 3)) {
      for (const s of currentDb.shipments) {
        if (!s.scope) {
          s.scope = s.courierCode === 'CHINA_ID_CROSSBORDER' ? 'INTERNATIONAL' : 'LOCAL';
        }
        if (!s.trackingHistory) {
          s.trackingHistory = [];
        }
      }
      const v3Record: ShopMigrationRecord = {
        id: 'mig_003_shipment_scope_indexing',
        version: 3,
        name: 'Shipment Scope and Cross-border Indexing',
        appliedAt: new Date().toISOString(),
        source: 'ShopMigrationRunner',
        notes: 'Ensures shipment tracking history and scope separation (LOCAL vs INTERNATIONAL)'
      };
      currentDb.migrations.push(v3Record);
      appliedCount++;
    }

    const result: MigrationResult = {
      success: true,
      appliedCount,
      migratedFromLegacy,
      legacyRecordsFound,
      message: `Migrasi Tumpang Shop berhasil: ${appliedCount} versi baru diterapkan, ${legacyRecordsFound} data legacy diverifikasi.`,
      timestamp: new Date().toISOString()
    };

    return { updatedDb: currentDb, result };
  }

  /**
   * Audit legacy database files for any shop-related data
   */
  public auditLegacyData(): {
    hasShopData: boolean;
    totalRecords: number;
    categories: ShopCategory[];
    products: ShopProduct[];
    orders: any[];
  } {
    const candidateFiles = [
      path.join(process.cwd(), 'tumpang_db.json'),
      path.join(process.cwd(), 'tumpang_food_db.json.backup.json')
    ];

    let foundCategories: ShopCategory[] = [];
    let foundProducts: ShopProduct[] = [];
    let foundOrders: any[] = [];

    for (const f of candidateFiles) {
      if (fs.existsSync(f)) {
        try {
          const content = JSON.parse(fs.readFileSync(f, 'utf-8'));
          if (Array.isArray(content.shop_categories)) foundCategories.push(...content.shop_categories);
          if (Array.isArray(content.shop_products)) foundProducts.push(...content.shop_products);
          if (Array.isArray(content.shop_orders)) foundOrders.push(...content.shop_orders);
        } catch {
          // Ignore read errors from optional candidate files
        }
      }
    }

    const total = foundCategories.length + foundProducts.length + foundOrders.length;
    return {
      hasShopData: total > 0,
      totalRecords: total,
      categories: foundCategories,
      products: foundProducts,
      orders: foundOrders
    };
  }

  /**
   * Ensure default categories and seed products exist if database is fresh
   */
  private ensureBaselineData(db: ShopDatabaseSchema) {
    if (!db.config || !db.config.id) {
      db.config = {
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
      };
    }

    if (!Array.isArray(db.categories) || db.categories.length === 0) {
      db.categories = [
        {
          id: 'scat_sembako',
          name: 'Sembako & Kebutuhan Pokok',
          slug: 'sembako',
          description: 'Beras, minyak goreng, gula, tepung, telur, dan sembako berkualitas.',
          icon: 'Package',
          orderIndex: 1,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'scat_bumbu',
          name: 'Sayur Segar & Bumbu Dapur',
          slug: 'bumbu-sayur',
          description: 'Bahan segar dari pasar Tumpang langsung ke dapur Anda.',
          icon: 'Carrot',
          orderIndex: 2,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'scat_khas',
          name: 'Oleh-Oleh & Khas Tumpang',
          slug: 'khas-tumpang',
          description: 'Kopi Semeru Dampit, keripik tempe sagu, dan jajanan khas Tumpang.',
          icon: 'Coffee',
          orderIndex: 3,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'scat_kebersihan',
          name: 'Kebersihan & Rumah Tangga',
          slug: 'kebersihan',
          description: 'Sabun, deterjen, sampo, dan perlengkapan kebersihan rumah.',
          icon: 'Sparkles',
          orderIndex: 4,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
    }

    if (!Array.isArray(db.products) || db.products.length === 0) {
      db.products = [
        {
          id: 'sprod_beras_5kg',
          sku: 'TS-SBK-001',
          name: 'Beras Premium Petani Tumpang 5kg',
          description: 'Beras pulen pilihan langsung dari petani lokal lereng Bromo Tumpang. Tanpa pengawet dan pemutih.',
          price: 72000,
          originalPrice: 75000,
          stock: 45,
          unit: 'karung 5kg',
          categoryId: 'scat_sembako',
          image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80',
          isActive: true,
          isFeatured: true,
          minOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'sprod_minyak_goreng_2l',
          sku: 'TS-SBK-002',
          name: 'Minyak Goreng Refill 2 Liter',
          description: 'Minyak goreng sawit jernih kualitas prima untuk aneka gorengan renyah keluarga.',
          price: 34000,
          stock: 60,
          unit: 'pouch 2L',
          categoryId: 'scat_sembako',
          image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80',
          isActive: true,
          isFeatured: true,
          minOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'sprod_kopi_dampit_250g',
          sku: 'TS-KHS-001',
          name: 'Kopi Robusta Lereng Semeru Tumpang 250g',
          description: 'Biji kopi robusta pilihan dari perkebunan lereng Gunung Semeru. Aroma mantap, rasa legit cokelat khas Malang Timur.',
          price: 38000,
          stock: 30,
          unit: 'pouch 250g',
          categoryId: 'scat_khas',
          image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=600&q=80',
          isActive: true,
          isFeatured: true,
          minOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
    }

    if (!Array.isArray(db.orders)) db.orders = [];
    if (!Array.isArray(db.shipments)) db.shipments = [];
    if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
  }
}
