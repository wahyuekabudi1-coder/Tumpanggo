/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Driver Routes
 * Handles courier profile operations, status toggles, and delivery assignments.
 * Protected with RBAC so drivers can only view and manage their own profile and tasks.
 */

import { Router, Request, Response } from 'express';
import { foodDb } from '../db';
import { requireRole, requireDriverSelf } from '../auth';

export const driverRouter = Router();

// Driver list - Safe public list for login/assignment selection, sanitized
driverRouter.get('/', (req: Request, res: Response) => {
  const drivers = foodDb.getDrivers();
  // Strip any passwords or private data
  const sanitized = drivers.map(d => ({
    id: d.id,
    name: d.name,
    phone: d.phone,
    active: d.active
  }));
  res.json(sanitized);
});

driverRouter.get('/:id', requireDriverSelf('id'), (req: Request, res: Response) => {
  const d = foodDb.getDriverById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Driver not found' });
  res.json(d);
});

driverRouter.post('/', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const { userId, ...driverData } = req.body;
  try {
    const created = await foodDb.createDriver(req.user?.userId || userId || 'admin', driverData);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

driverRouter.put('/:id', requireDriverSelf('id'), async (req: Request, res: Response) => {
  const { userId, role, ...rawUpdates } = req.body || {};
  const updates: any = { ...rawUpdates };

  // Canonical identifiers and system keys are strictly immutable
  delete updates.id;

  const isAdmin = Boolean(req.user?.role === 'ADMIN' || req.user?.role === 'MASTER_ADMIN' || req.user?.isMasterAdmin);
  const effectiveRole = (isAdmin ? 'ADMIN' : 'DRIVER') as 'ADMIN' | 'DRIVER';

  // Strict Privilege Separation: Non-admin drivers cannot alter account status, metrics, or identity
  if (!isAdmin) {
    delete updates.active;
    delete updates.rating;
    delete updates.createdAt;
    delete updates.email;
    delete updates.password;

    // A deactivated or pending driver cannot toggle status online
    if (updates.online !== undefined && Boolean(updates.online)) {
      const currentDriver = foodDb.getDriverById(req.params.id);
      if (currentDriver && !currentDriver.active) {
        return res.status(403).json({
          error: 'Akun kurir Anda belum disetujui atau dinonaktifkan oleh Administrator. Status Online tidak dapat diaktifkan.',
          code: 'DRIVER_INACTIVE'
        });
      }
    }
  }

  try {
    const actorId = req.user?.userId || req.user?.entityId || req.params.id;
    const updated = await foodDb.updateDriver(
      actorId,
      req.params.id,
      updates,
      effectiveRole
    );
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

driverRouter.delete('/:id', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const { userId } = req.body;
  try {
    const success = await foodDb.deleteDriver(req.user?.userId || userId || 'admin', req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: 'Driver not found' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

driverRouter.get('/:driverId/orders', requireDriverSelf('driverId'), (req: Request, res: Response) => {
  res.json(foodDb.getOrdersByDriver(req.params.driverId));
});

// Broadcast / Available unassigned orders ready for delivery (only active & online drivers)
driverRouter.get('/:driverId/available-orders', requireDriverSelf('driverId'), (req: Request, res: Response) => {
  const driver = foodDb.getDriverById(req.params.driverId);
  if (!driver) {
    return res.status(404).json({ error: 'Data kurir tidak ditemukan.' });
  }
  if (!driver.active) {
    return res.status(403).json({ error: 'Akun kurir belum disetujui atau dinonaktifkan oleh administrator.' });
  }
  if (!driver.online) {
    return res.status(400).json({ error: 'Status kurir sedang offline. Aktifkan status online untuk melihat daftar tugas yang tersedia.' });
  }
  res.json(foodDb.getAvailableOrdersForDrivers());
});

// Driver accepts an unassigned delivery task atomically
driverRouter.post('/:driverId/accept-order/:orderId', requireDriverSelf('driverId'), async (req: Request, res: Response) => {
  try {
    const updated = await foodDb.acceptDriverTask(req.params.driverId, req.params.orderId);
    res.json({ success: true, order: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Gagal menerima tugas pesanan.' });
  }
});

