/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Merchant Routes
 * Manages merchant profiles, menu catalogs, orders, and license redemptions.
 */

import path from 'path';
import fs from 'fs';
import { Router, Request, Response, NextFunction } from 'express';
import { foodDb } from '../db';
import { requireRole, requireMerchantOwner } from '../auth';

export const merchantRouter = Router();

// --- MERCHANT PROFILES ---
merchantRouter.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = foodDb.getMerchants();
    res.json(list);
  } catch (err) {
    next(err);
  }
});

merchantRouter.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const m = foodDb.getMerchantById(req.params.id);
    if (!m) {
      const pendingReg = foodDb.getPartnerRegistrations().find(r => r.id === req.params.id || r.storeId === req.params.id);
      if (pendingReg && pendingReg.status === 'PENDING') {
        return res.status(403).json({
          error: 'Pendaftaran mitra toko Anda sedang dalam peninjauan oleh Administrator tumpangGo. Akses operasional dashboard belum dibuka.',
          isPendingApproval: true,
          status: 'PENDING'
        });
      }
      return res.status(404).json({ error: 'Merchant not found' });
    }
    if (!m.active && !m.isActivated) {
      return res.status(403).json({
        error: 'Akun toko Anda belum disetujui atau dinonaktifkan oleh Administrator.',
        isInactive: true,
        status: 'INACTIVE'
      });
    }
    res.json(m);
  } catch (err) {
    next(err);
  }
});

// Dedicated endpoint to query Merchant Static QRIS metadata
merchantRouter.get('/:id/qris', (req: Request, res: Response) => {
  try {
    const m = foodDb.getMerchantById(req.params.id);
    if (!m) return res.status(404).json({ error: 'Merchant tidak ditemukan.' });
    const rawQris = m.qrisImage;
    const hasQris = Boolean(rawQris && typeof rawQris === 'string' && rawQris.trim().length > 3 && !rawQris.includes('unsplash'));
    res.json({
      merchantId: m.id,
      merchantName: m.name,
      hasQris,
      qrisImage: hasQris ? rawQris : null,
      qrisImageUrl: hasQris ? `/api/merchants/${m.id}/qris-image` : null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat status QRIS toko.' });
  }
});

// Dedicated endpoint to stream or serve Merchant Static QRIS binary directly
merchantRouter.get('/:id/qris-image', async (req: Request, res: Response) => {
  try {
    const m = foodDb.getMerchantById(req.params.id);
    if (!m) return res.status(404).json({ error: 'Merchant tidak ditemukan.' });
    const rawQris = m.qrisImage;
    if (!rawQris || typeof rawQris !== 'string' || rawQris.trim().length < 3 || rawQris.includes('unsplash')) {
      return res.status(404).json({ error: `Toko "${m.name}" belum memiliki QRIS statis resmi.` });
    }

    const cleanQris = rawQris.trim();

    // 1. Base64 Data URL
    if (cleanQris.startsWith('data:image/')) {
      const matches = cleanQris.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/);
      if (matches) {
        res.setHeader('Content-Type', matches[1]);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(Buffer.from(matches[2], 'base64'));
      }
    }

    // 2. Relative static asset path (e.g. /qris-merchant.png)
    if (cleanQris.startsWith('/')) {
      const candidatePaths = [
        path.resolve(process.cwd(), 'dist', cleanQris.replace(/^\//, '')),
        path.resolve(process.cwd(), 'public', cleanQris.replace(/^\//, '')),
        path.resolve('/var/task', 'dist', cleanQris.replace(/^\//, '')),
        path.resolve('/var/task', 'public', cleanQris.replace(/^\//, ''))
      ];
      for (const p of candidatePaths) {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          const ext = path.extname(p).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
          res.setHeader('Content-Type', mime);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.sendFile(p);
        }
      }
    }

    // 3. Absolute URL redirect
    if (cleanQris.startsWith('http://') || cleanQris.startsWith('https://')) {
      return res.redirect(cleanQris);
    }

    return res.status(404).json({ error: 'Gambar QRIS tidak dapat diakses.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat gambar QRIS.' });
  }
});

merchantRouter.post('/', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const merchantData = req.body;
  try {
    const actorId = req.user?.userId || 'admin';
    const created = await foodDb.createMerchant(actorId, merchantData);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.put('/:id', requireMerchantOwner('id'), async (req: Request, res: Response) => {
  const updates = { ...req.body };
  // Canonical identifiers and system keys are strictly immutable
  delete updates.id;

  const isAdmin = Boolean(req.user?.role === 'ADMIN' || req.user?.role === 'MASTER_ADMIN' || req.user?.isMasterAdmin);
  const actorRole = (isAdmin ? 'ADMIN' : 'MERCHANT') as 'ADMIN' | 'MERCHANT';

  // Strict Privilege Separation: Non-admin merchants cannot alter operational status, metrics, or identity
  if (!isAdmin) {
    delete updates.active;
    delete updates.isActivated;
    delete updates.rating;
    delete updates.menuCount;
    delete updates.createdAt;
    delete updates.password;
    delete updates.email;
  }

  try {
    const actorId = req.user?.userId || req.user?.entityId || req.params.id;
    const updated = await foodDb.updateMerchant(actorId, req.params.id, updates, actorRole);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Dedicated endpoint to upload or update Merchant Static QRIS
merchantRouter.put('/:id/qris', requireMerchantOwner('id'), async (req: Request, res: Response) => {
  const { qrisImage } = req.body;
  if (!qrisImage || typeof qrisImage !== 'string' || qrisImage.trim().length < 10) {
    return res.status(400).json({ error: 'Gambar QRIS statis wajib diunggah dalam format gambar yang sah.' });
  }

  const cleanQris = qrisImage.trim();
  if (!cleanQris.startsWith('data:image/') && !cleanQris.startsWith('http://') && !cleanQris.startsWith('https://')) {
    return res.status(400).json({ error: 'Format QRIS tidak didukung. Unggah gambar berformat JPEG, PNG, atau WebP.' });
  }

  // Size guard: ~5MB base64 limit
  if (cleanQris.length > 7 * 1024 * 1024) {
    return res.status(400).json({ error: 'Ukuran file gambar QRIS melebihi batas maksimal 5MB. Silakan gunakan gambar yang lebih kecil.' });
  }

  try {
    const actorId = req.user?.userId || req.user?.entityId || req.params.id;
    const actorRole = (req.user?.role === 'ADMIN' || req.user?.role === 'MASTER_ADMIN' || req.user?.isMasterAdmin ? 'ADMIN' : 'MERCHANT') as 'ADMIN' | 'MERCHANT';
    const updated = await foodDb.updateMerchant(
      actorId,
      req.params.id,
      {
        qrisImage: cleanQris,
        qrisUpdatedAt: new Date().toISOString()
      },
      actorRole
    );
    res.json({
      success: true,
      message: 'QRIS statis merchant berhasil disimpan.',
      qrisImage: updated.qrisImage,
      qrisUpdatedAt: updated.qrisUpdatedAt,
      merchant: updated
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Gagal menyimpan QRIS merchant.' });
  }
});

// Remove Merchant Static QRIS
merchantRouter.delete('/:id/qris', requireMerchantOwner('id'), async (req: Request, res: Response) => {
  try {
    const actorId = req.user?.userId || req.user?.entityId || req.params.id;
    const actorRole = (req.user?.role === 'ADMIN' || req.user?.role === 'MASTER_ADMIN' || req.user?.isMasterAdmin ? 'ADMIN' : 'MERCHANT') as 'ADMIN' | 'MERCHANT';
    const updated = await foodDb.updateMerchant(
      actorId,
      req.params.id,
      {
        qrisImage: '',
        qrisUpdatedAt: new Date().toISOString()
      },
      actorRole
    );
    res.json({
      success: true,
      message: 'QRIS statis merchant berhasil dihapus.',
      merchant: updated
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'Gagal menghapus QRIS merchant.' });
  }
});

merchantRouter.delete('/:id', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const actorId = req.user?.userId || 'admin';
  try {
    const success = await foodDb.deleteMerchant(actorId, req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: 'Merchant not found' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- MENU CATEGORIES ---
merchantRouter.get('/:id/categories', (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(foodDb.getCategories(req.params.id));
  } catch (err) {
    next(err);
  }
});

merchantRouter.post('/:id/categories', requireMerchantOwner('id'), async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
  }
  try {
    const created = await foodDb.createCategory(req.params.id, name.trim());
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.put('/:merchantId/categories/:id', requireMerchantOwner('merchantId'), async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi.' });
  }
  try {
    const updated = await foodDb.updateCategory(req.params.merchantId, req.params.id, name.trim());
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.delete('/:merchantId/categories/:id', requireMerchantOwner('merchantId'), async (req: Request, res: Response) => {
  try {
    const success = await foodDb.deleteCategory(req.params.merchantId, req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: 'Category not found' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- MENU ITEMS ---
merchantRouter.get('/:id/menu', (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(foodDb.getMenuItemsByMerchant(req.params.id));
  } catch (err) {
    next(err);
  }
});

merchantRouter.post('/:id/menu', requireMerchantOwner('id'), async (req: Request, res: Response) => {
  try {
    const created = await foodDb.createMenuItem(req.params.id, req.body);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.put('/:merchantId/menu/:id', requireMerchantOwner('merchantId'), async (req: Request, res: Response) => {
  try {
    const updated = await foodDb.updateMenuItem(req.params.merchantId, req.params.id, req.body);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

merchantRouter.delete('/:merchantId/menu/:id', requireMerchantOwner('merchantId'), async (req: Request, res: Response) => {
  try {
    const success = await foodDb.deleteMenuItem(req.params.merchantId, req.params.id);
    if (success) res.json({ success: true });
    else res.status(404).json({ error: 'Menu item not found' });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- ORDERS & SETTLEMENTS ---
merchantRouter.get('/:merchantId/orders', requireMerchantOwner('merchantId'), async (req: Request, res: Response) => {
  try {
    const rawTarget = req.params.merchantId;
    const targetId = rawTarget === 'me' ? (req.user?.entityId || req.user?.userId || '') : rawTarget;
    const orders = await foodDb.findOrdersByMerchant(targetId);
    res.json(orders);
  } catch (err: any) {
    console.error(`[Merchant Orders Error] Gagal memuat pesanan untuk merchant "${req.params.merchantId}":`, err?.message);
    res.status(500).json({ error: err?.message || 'Gagal memuat daftar pesanan merchant.' });
  }
});

merchantRouter.get('/:merchantId/settlements', requireMerchantOwner('merchantId'), (req: Request, res: Response) => {
  res.json(foodDb.getSettlementsByMerchant(req.params.merchantId));
});

