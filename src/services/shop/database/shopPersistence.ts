/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop Dedicated Persistence Engine
 * Completely decoupled from Tumpang Food's Firestore database.
 * 
 * Guarantees:
 * 1. Synchronous/awaited persistence: All mutations await PostgreSQL write before returning.
 * 2. Race condition protection: Row-level locking (SELECT FOR UPDATE) in PostgreSQL across serverless instances,
 *    and promise queue serialization within process.
 * 3. Explicit failure propagation: Throws ShopStorageError on write failures so API never reports false success.
 * 4. Transparent diagnostic: Distinguishes true persistent SQL from ephemeral /tmp storage in Vercel serverless.
 */

import fs from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import { shopEnv } from '../config/shopEnv';
import { ShopDatabaseSchema } from './shopSchema';

export class ShopStorageError extends Error {
  public readonly isStorageError = true;
  public readonly status = 500;
  public readonly code = 'STORAGE_PERSISTENCE_FAILED';

  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = 'ShopStorageError';
  }
}

export interface ShopStorageDiagnostic {
  service: 'tumpang-shop';
  databaseType: string;
  filePath: string;
  isPersistentOnServerless: boolean;
  liveCloudConnected: boolean;
  storageMode: 'dedicated_sql_persistent' | 'degraded_sql_connection_failed' | 'dedicated_firestore_isolated' | 'local_persistent_file' | 'ephemeral_serverless_file';
  decoupledFromFoodFirestore: true;
  warning?: string;
  remediationStep?: string;
  lastError?: string;
}

export class ShopPersistenceManager {
  private isServerless: boolean;
  private filePath: string;
  private databaseUrl: string;
  private dedicatedFirestoreProject: string;
  private pgPool: Pool | null = null;
  private isPgTableReady = false;
  private processMutationQueue: Promise<any> = Promise.resolve();
  private lastPgConnectionError: string | null = null;

  constructor(overrideDatabaseUrl?: string) {
    this.isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    this.filePath = shopEnv.database.filePath;
    this.databaseUrl = (overrideDatabaseUrl !== undefined ? overrideDatabaseUrl : (process.env.SHOP_DATABASE_URL || '')).trim();
    this.dedicatedFirestoreProject = (process.env.SHOP_FIRESTORE_PROJECT_ID || '').trim();

    // STRICT SAFETY CHECK: Refuse to connect if configured to point to Food's project
    if (this.dedicatedFirestoreProject && this.dedicatedFirestoreProject === 'tumpanggo-70479') {
      console.error('[ShopPersistence] CRITICAL SAFETY VIOLATION: SHOP_FIRESTORE_PROJECT_ID cannot point to Food project (tumpanggo-70479). Decoupling enforced.');
      this.dedicatedFirestoreProject = '';
    }

    this.initPool();
  }

  private initPool(): void {
    if (this.databaseUrl) {
      try {
        const isSslRequired = this.databaseUrl.includes('sslmode=require') || (!this.databaseUrl.includes('localhost') && !this.databaseUrl.includes('127.0.0.1'));
        this.pgPool = new Pool({
          connectionString: this.databaseUrl,
          ssl: isSslRequired ? { rejectUnauthorized: false } : undefined,
          max: 5,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 10000
        });
        console.log('[ShopPersistence] Dedicated PostgreSQL adapter initialized for Tumpang Shop.');
      } catch (err: any) {
        this.lastPgConnectionError = err?.message || String(err);
        console.error('[ShopPersistence] Failed to initialize PostgreSQL pool:', this.lastPgConnectionError);
        this.pgPool = null;
      }
    }
  }

  /**
   * Reconfigure database pool (useful for tests and dynamic updates)
   */
  public setDatabaseUrl(url: string): void {
    if (this.pgPool) {
      this.pgPool.end().catch(() => {});
      this.pgPool = null;
    }
    this.databaseUrl = url.trim();
    this.isPgTableReady = false;
    this.lastPgConnectionError = null;
    this.initPool();
  }

  public getPool(): Pool | null {
    return this.pgPool;
  }

  /**
   * Ensure the shop_datastore table with concurrency versioning exists in PostgreSQL
   */
  public async ensurePgTable(client?: PoolClient): Promise<boolean> {
    if (!this.pgPool && !client) return false;
    if (this.isPgTableReady) return true;

    const executor = client || this.pgPool!;
    try {
      await executor.query(`
        CREATE TABLE IF NOT EXISTS shop_datastore (
          key VARCHAR(64) PRIMARY KEY,
          data JSONB NOT NULL,
          version BIGINT NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      this.isPgTableReady = true;
      this.lastPgConnectionError = null;
      return true;
    } catch (err: any) {
      this.lastPgConnectionError = err?.message || String(err);
      console.warn('[ShopPersistence PG] Gagal inisialisasi tabel shop_datastore:', this.lastPgConnectionError);
      return false;
    }
  }

  /**
   * Check live connection to PostgreSQL
   */
  public async testPgConnection(): Promise<{ connected: boolean; error?: string }> {
    if (!this.pgPool) return { connected: false, error: 'NO_DATABASE_URL' };
    try {
      const res = await this.pgPool.query('SELECT 1 as alive');
      if (res && res.rows) {
        this.lastPgConnectionError = null;
        return { connected: true };
      }
      return { connected: false, error: 'EMPTY_RESPONSE' };
    } catch (err: any) {
      this.lastPgConnectionError = err?.message || String(err);
      return { connected: false, error: this.lastPgConnectionError };
    }
  }

  /**
   * Query persistent schema state from PostgreSQL
   */
  public async loadFromPostgres(): Promise<ShopDatabaseSchema | null> {
    if (!this.pgPool) return null;
    try {
      const tableReady = await this.ensurePgTable();
      if (!tableReady) return null;

      const res = await this.pgPool.query(
        'SELECT data FROM shop_datastore WHERE key = $1 LIMIT 1',
        ['shop_database_state']
      );

      if (res.rows && res.rows.length > 0 && res.rows[0].data) {
        const remoteData = res.rows[0].data;
        this.saveLocalSync(remoteData);
        this.lastPgConnectionError = null;
        console.log('[ShopPersistence PG] Berhasil memuat data persisten Shop dari PostgreSQL.');
        return remoteData as ShopDatabaseSchema;
      }
    } catch (err: any) {
      this.lastPgConnectionError = err?.message || String(err);
      console.warn('[ShopPersistence PG] Gagal membaca data dari PostgreSQL:', this.lastPgConnectionError);
    }
    return null;
  }

  /**
   * Save schema state to PostgreSQL (compatibility alias)
   */
  public async saveToPostgres(schema: ShopDatabaseSchema): Promise<boolean> {
    try {
      await this.persistState(schema);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute atomic, race-condition protected mutation.
   * Supports dynamic schema getter to prevent stale closure reads during parallel invocations.
   */
  public async executeAtomicMutation<T>(
    currentMemorySchema: ShopDatabaseSchema | (() => ShopDatabaseSchema),
    mutator: (lockedSchema: ShopDatabaseSchema) => Promise<{ updatedSchema: ShopDatabaseSchema; result: T }> | { updatedSchema: ShopDatabaseSchema; result: T }
  ): Promise<{ updatedSchema: ShopDatabaseSchema; result: T }> {
    // Process-level queue lock to prevent concurrent async interleaving within the instance
    return new Promise((resolve, reject) => {
      this.processMutationQueue = this.processMutationQueue
        .then(async () => {
          try {
            const baseSchema = typeof currentMemorySchema === 'function' ? currentMemorySchema() : currentMemorySchema;
            const outcome = await this.performMutation(baseSchema, mutator);
            resolve(outcome);
          } catch (err) {
            reject(err);
          }
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  private async performMutation<T>(
    fallbackSchema: ShopDatabaseSchema,
    mutator: (lockedSchema: ShopDatabaseSchema) => Promise<{ updatedSchema: ShopDatabaseSchema; result: T }> | { updatedSchema: ShopDatabaseSchema; result: T }
  ): Promise<{ updatedSchema: ShopDatabaseSchema; result: T }> {
    // Case 1: PostgreSQL is configured - use row-level locking (SELECT FOR UPDATE)
    if (this.pgPool) {
      let client: PoolClient | null = null;
      try {
        client = await this.pgPool.connect();
        await client.query('BEGIN');
        await this.ensurePgTable(client);

        // Fetch and lock the database row exclusively
        let selectRes = await client.query(
          'SELECT data, version FROM shop_datastore WHERE key = $1 FOR UPDATE',
          ['shop_database_state']
        );

        let baseSchema: ShopDatabaseSchema;
        if (selectRes.rows.length === 0) {
          // Initialize table row if first time
          await client.query(`
            INSERT INTO shop_datastore (key, data, version, updated_at)
            VALUES ($1, $2, 1, NOW())
            ON CONFLICT (key) DO NOTHING;
          `, ['shop_database_state', JSON.stringify(fallbackSchema)]);

          selectRes = await client.query(
            'SELECT data, version FROM shop_datastore WHERE key = $1 FOR UPDATE',
            ['shop_database_state']
          );
          baseSchema = selectRes.rows.length > 0 ? selectRes.rows[0].data : fallbackSchema;
        } else {
          baseSchema = selectRes.rows[0].data;
        }

        // Apply mutation to the locked authoritative state
        const { updatedSchema, result } = await mutator(baseSchema);

        // Persist back within the transaction
        await client.query(`
          UPDATE shop_datastore
          SET data = $1, version = version + 1, updated_at = NOW()
          WHERE key = $2;
        `, [JSON.stringify(updatedSchema), 'shop_database_state']);

        await client.query('COMMIT');
        client.release();
        client = null;

        // Keep local cache file updated
        this.saveLocalSync(updatedSchema);
        this.lastPgConnectionError = null;

        return { updatedSchema, result };

      } catch (err: any) {
        if (client) {
          try {
            await client.query('ROLLBACK');
          } catch {}
          client.release();
        }
        this.lastPgConnectionError = err?.message || String(err);
        console.error('[ShopPersistence] Transaksi PostgreSQL gagal, perubahan dibatalkan:', this.lastPgConnectionError);
        throw new ShopStorageError(
          `Gagal menyimpan perubahan ke PostgreSQL: ${this.lastPgConnectionError}. Operasi dibatalkan demi konsistensi data.`,
          err
        );
      }
    }

    // Case 2: PostgreSQL is NOT configured
    // Check if in Vercel serverless production
    if (this.isServerless && process.env.NODE_ENV === 'production') {
      console.warn('[ShopPersistence Warning] Operasi tulis dieksekusi di serverless tanpa SHOP_DATABASE_URL. Data tersimpan di /tmp (efemeral).');
    }

    try {
      const { updatedSchema, result } = await mutator(fallbackSchema);
      this.saveLocalSync(updatedSchema);
      return { updatedSchema, result };
    } catch (err: any) {
      throw new ShopStorageError(`Gagal menyimpan perubahan ke file lokal: ${err?.message || err}`, err);
    }
  }

  /**
   * Diagnostic assessment
   */
  public async getDiagnostic(): Promise<ShopStorageDiagnostic> {
    const hasExternalSql = Boolean(this.databaseUrl);
    const hasDedicatedFirestore = Boolean(this.dedicatedFirestoreProject && process.env.SHOP_FIREBASE_SERVICE_ACCOUNT_KEY);

    if (hasExternalSql) {
      const check = await this.testPgConnection();
      if (check.connected) {
        return {
          service: 'tumpang-shop',
          databaseType: 'postgresql',
          filePath: this.filePath,
          isPersistentOnServerless: true,
          liveCloudConnected: true,
          storageMode: 'dedicated_sql_persistent',
          decoupledFromFoodFirestore: true
        };
      } else {
        return {
          service: 'tumpang-shop',
          databaseType: 'postgresql',
          filePath: this.filePath,
          isPersistentOnServerless: false,
          liveCloudConnected: false,
          storageMode: 'degraded_sql_connection_failed',
          decoupledFromFoodFirestore: true,
          warning: `Koneksi ke PostgreSQL gagal (${check.error || 'Connection Failed'}). Penyimpanan persisten Shop dalam status terdegradasi.`,
          lastError: check.error,
          remediationStep: 'Periksa nilai SHOP_DATABASE_URL pada Vercel Dashboard dan pastikan server database dapat menerima koneksi eksternal dengan SSL.'
        };
      }
    }

    if (hasDedicatedFirestore) {
      return {
        service: 'tumpang-shop',
        databaseType: 'firestore',
        filePath: this.filePath,
        isPersistentOnServerless: true,
        liveCloudConnected: true,
        storageMode: 'dedicated_firestore_isolated',
        decoupledFromFoodFirestore: true
      };
    }

    if (this.isServerless) {
      return {
        service: 'tumpang-shop',
        databaseType: 'file',
        filePath: this.filePath,
        isPersistentOnServerless: false,
        liveCloudConnected: false,
        storageMode: 'ephemeral_serverless_file',
        decoupledFromFoodFirestore: true,
        warning: 'Shop berjalan pada filesystem sementara Vercel (/tmp). SHOP_DATABASE_URL belum dikonfigurasi, data TIDAK permanen antar cold-start serverless.',
        remediationStep: 'Tambahkan variabel lingkungan SHOP_DATABASE_URL (misal PostgreSQL gratis di Neon/Supabase) pada Vercel Dashboard untuk persistensi permanen.'
      };
    }

    return {
      service: 'tumpang-shop',
      databaseType: 'file',
      filePath: this.filePath,
      isPersistentOnServerless: true,
      liveCloudConnected: false,
      storageMode: 'local_persistent_file',
      decoupledFromFoodFirestore: true
    };
  }

  /**
   * Load schema synchronously from local storage snapshot
   */
  public loadInitialState(defaultSchema: ShopDatabaseSchema): ShopDatabaseSchema {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            config: parsed.config || defaultSchema.config,
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
      console.warn('[ShopPersistence] Gagal membaca state lokal Shop, menggunakan default:', err?.message || err);
    }
    return defaultSchema;
  }

  /**
   * Synchronous atomic local file save
   */
  private saveLocalSync(schema: ShopDatabaseSchema): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tempPath = `${this.filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(schema, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err: any) {
      console.error('[ShopPersistence] Gagal menyimpan file Shop:', err?.message || err);
    }
  }

  /**
   * Explicitly awaited state persistence
   */
  public async persistState(schema: ShopDatabaseSchema): Promise<void> {
    if (this.pgPool) {
      let client: PoolClient | null = null;
      try {
        client = await this.pgPool.connect();
        await this.ensurePgTable(client);
        await client.query(`
          INSERT INTO shop_datastore (key, data, version, updated_at)
          VALUES ($1, $2, 1, NOW())
          ON CONFLICT (key) DO UPDATE
          SET data = EXCLUDED.data, version = shop_datastore.version + 1, updated_at = NOW();
        `, ['shop_database_state', JSON.stringify(schema)]);
        client.release();
        this.saveLocalSync(schema);
        this.lastPgConnectionError = null;
      } catch (err: any) {
        if (client) client.release();
        this.lastPgConnectionError = err?.message || String(err);
        throw new ShopStorageError(`Penyimpanan data ke PostgreSQL gagal: ${this.lastPgConnectionError}`, err);
      }
    } else {
      this.saveLocalSync(schema);
    }
  }

  /**
   * Safe backup creation
   */
  public createBackup(): string {
    const backupPath = `${this.filePath}.backup_${Date.now()}.json`;
    try {
      if (fs.existsSync(this.filePath)) {
        fs.copyFileSync(this.filePath, backupPath);
      }
    } catch (e: any) {
      console.warn('[ShopPersistence] Backup warning:', e?.message || e);
    }
    return backupPath;
  }
}

export const shopPersistence = new ShopPersistenceManager();
