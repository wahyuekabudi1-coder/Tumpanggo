/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop Standalone Microservice Server Entry Point
 * Runs Tumpang Shop as an independent process on its own port.
 * Allows autonomous development, testing, and deployment.
 */

import http from 'http';
import { shopApp } from './api/shopApp';
import { shopDb } from './database/shopDatabase';
import { shopEnv } from './config/shopEnv';

async function bootstrap() {
  console.log('====================================================');
  console.log('🛒 STARTING TUMPANG SHOP INDEPENDENT BACKEND SERVICE');
  console.log('====================================================');

  // Initialize independent database
  await shopDb.ensureInitialized();
  const storageStatus = await shopDb.getStorageStatus();
  console.log(`[Shop Service] Database ready (${storageStatus.storageMode})`);
  console.log(`[Shop Service] Database file: ${storageStatus.filePath}`);
  console.log(`[Shop Service] Active Products: ${storageStatus.totalProducts} | Categories: ${storageStatus.totalCategories}`);

  const port = shopEnv.port;
  const server = http.createServer(shopApp);

  server.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Tumpang Shop Backend running independently at http://localhost:${port}`);
    console.log(`📡 Health Check: http://localhost:${port}/health`);
    console.log(`📦 Catalog API: http://localhost:${port}/products`);
    console.log(`🔒 Admin Auth: http://localhost:${port}/auth/login`);
  });

  process.on('SIGTERM', () => {
    console.log('[Shop Service] Gracefully shutting down...');
    server.close(() => {
      console.log('[Shop Service] Closed.');
      process.exit(0);
    });
  });
}

// Execute bootstrap if run directly
if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch(err => {
    console.error('[Shop Service Fatal Error]', err);
    process.exit(1);
  });
}

export { shopApp };
