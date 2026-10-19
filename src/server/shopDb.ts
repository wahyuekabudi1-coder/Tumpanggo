/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop Database - Forwarding Adapter
 * Re-exports the isolated ShopDatabase engine from src/services/shop/database/shopDatabase.
 * Preserves 100% backward compatibility for existing scripts, tests, and tools.
 */

export * from '../services/shop/database/shopDatabase';
export * from '../services/shop/database/shopSchema';
export * from '../services/shop/shipping/courierAdapters';
