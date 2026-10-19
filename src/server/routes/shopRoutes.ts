/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Shop Route Adapter
 * Forwards to the isolated and decoupled Tumpang Shop Express application
 * located at src/services/shop/api/shopApp.ts.
 */

import { shopApp } from '../../services/shop/api/shopApp';

export { shopApp, shopApp as shopRouter };
export default shopApp;
