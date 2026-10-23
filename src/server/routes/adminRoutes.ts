/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Administrative Routes
 * Manages system parameters, partner onboarding, payouts, and licenses.
 * Endpoints: /merchants (via merchantRouter), /drivers (via driverRouter), and /partner-registrations.
 * Strictly protected with Admin-only RBAC middleware.
 */

import { Router, Request, Response } from 'express';
import { foodDb } from '../db';
import { requireRole } from '../auth';

export const adminRouter = Router();

// --- SYSTEM CONFIG ---
// Public read for customer fee calculations, service fee tiers, and QRIS display.
// Strictly sanitizes masterAccount to never expose passwordHash over the network.
adminRouter.get('/config', (req: Request, res: Response) => {
  const fullConfig = foodDb.getConfig();
  const { masterAccount, ...safeConfig } = fullConfig;
  const sanitizedMaster = masterAccount?.email ? { email: masterAccount.email } : undefined;
  res.json({
    ...safeConfig,
    ...(sanitizedMaster ? { masterAccount: sanitizedMaster } : {})
  });
});

adminRouter.put('/config', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const { userId, ...updates } = req.body;
  // Prevent tampering with masterAccount passwordHash via regular config updates
  if (updates.masterAccount) {
    delete (updates.masterAccount as any).passwordHash;
  }
  try {
    const config = await foodDb.updateConfig(req.user?.userId || userId || 'admin', updates);
    const { masterAccount, ...safeConfig } = config;
    const sanitizedMaster = masterAccount?.email ? { email: masterAccount.email } : undefined;
    res.json({
      ...safeConfig,
      ...(sanitizedMaster ? { masterAccount: sanitizedMaster } : {})
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- PARTNER REGISTRATIONS ---
adminRouter.get('/partner-registrations', requireRole(['ADMIN']), (req: Request, res: Response) => {
  res.json(foodDb.getPartnerRegistrations());
});

// Public application submission
adminRouter.post('/partner-registrations', async (req: Request, res: Response) => {
  try {
    const created = await foodDb.createPartnerRegistration(req.body);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

const handleApproveRegistration = async (req: Request, res: Response) => {
  const { userId } = req.body;
  try {
    const result = await foodDb.approvePartnerRegistration(req.user?.userId || userId || 'admin', req.params.id);
    if (result.success) {
      res.json({ success: true, registration: result.registration });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

adminRouter.put('/partner-registrations/:id/approve', requireRole(['ADMIN']), handleApproveRegistration);
adminRouter.post('/partner-registrations/:id/approve', requireRole(['ADMIN']), handleApproveRegistration);

const handleRejectRegistration = async (req: Request, res: Response) => {
  const { userId } = req.body;
  try {
    const success = await foodDb.rejectPartnerRegistration(req.user?.userId || userId || 'admin', req.params.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Registration not found' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

adminRouter.post('/partner-registrations/:id/reject', requireRole(['ADMIN']), handleRejectRegistration);
adminRouter.put('/partner-registrations/:id/reject', requireRole(['ADMIN']), handleRejectRegistration);

// --- SETTLEMENTS (Admin Only) ---
adminRouter.get('/settlements', requireRole(['ADMIN']), (req: Request, res: Response) => {
  res.json(foodDb.getSettlements());
});

adminRouter.post('/settlements', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const settlementData = req.body;
  try {
    const actorId = req.user?.userId || 'admin';
    const created = await foodDb.createSettlement(actorId, settlementData);
    res.status(201).json(created);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

adminRouter.put('/settlements/:id', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const updates = req.body;
  try {
    const actorId = req.user?.userId || 'admin';
    const updated = await foodDb.updateSettlement(actorId, req.params.id, updates);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

adminRouter.post('/settlements/generate', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const actorId = req.user?.userId || 'admin';
    const created = await foodDb.generateHPlusOneSettlements(actorId);
    res.json({ count: created.length, settlements: created });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.post('/settlements/:id/confirm', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const actorId = req.user?.userId || 'admin';
    const confirmed = await foodDb.confirmSettlement(actorId, req.params.id);
    res.json(confirmed);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- CLEAN SLATE DATA MERCHANT & KATALOG (Master Admin Only) ---
// Preview Clean Slate Plan (Read-Only)
adminRouter.get('/clean-slate-plan', requireRole(['MASTER_ADMIN']), async (req: Request, res: Response) => {
  try {
    const plan = await foodDb.getCleanSlatePlan();
    if (plan.isProduction && !plan.liveCloudConnected) {
      return res.status(503).json({
        error: 'Koneksi Cloud Firestore produksi tidak tersedia.',
        plan
      });
    }
    res.json(plan);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memuat rencana clean slate' });
  }
});

// Execute Clean Slate (Master Admin Only)
adminRouter.post('/clean-slate-merchants', requireRole(['MASTER_ADMIN']), async (req: Request, res: Response) => {
  try {
    const actorId = req.user?.userId || req.user?.email || 'master-admin';
    const result = await foodDb.cleanSlateMerchantCatalog(actorId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal mengeksekusi clean slate data merchant' });
  }
});

// Restore Clean Slate from Backup (Master Admin Only)
adminRouter.post('/clean-slate-restore', requireRole(['MASTER_ADMIN']), async (req: Request, res: Response) => {
  try {
    const actorId = req.user?.userId || req.user?.email || 'master-admin';
    const { backupId } = req.body;
    if (!backupId || typeof backupId !== 'string') {
      return res.status(400).json({ error: 'Parameter backupId wajib diisi.' });
    }
    const result = await foodDb.restoreMerchantCatalogFromBackup(actorId, backupId.trim());
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Gagal memulihkan katalog merchant dari backup' });
  }
});

// --- AUDIT LOGS (Admin Only) ---
adminRouter.get('/logs', requireRole(['ADMIN']), (req: Request, res: Response) => {
  res.json(foodDb.getLogs());
});

// --- CERITA / REVIEW PENGGUNA TUMPANGGO ---
// Public read - only approved and published reviews for homepage
const handleGetPublishedReviews = (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const list = foodDb.getPublishedTestimonials(category);
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Gagal memuat review pengguna' });
  }
};
adminRouter.get('/testimonials', handleGetPublishedReviews);
adminRouter.get('/reviews', handleGetPublishedReviews);

// Helper to sanitize text inputs and strip HTML tags
function sanitizeInput(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>?/gm, '').trim();
}

// Public submission - users/merchants submit experience for admin moderation
const handleSubmitReview = async (req: Request, res: Response) => {
  try {
    const rawName = sanitizeInput(req.body.userName);
    const rawCategory = String(req.body.category || '').toLowerCase().trim();
    const rawMerchantName = sanitizeInput(req.body.merchantName);
    const rawTitle = sanitizeInput(req.body.title);
    const rawContent = sanitizeInput(req.body.content);
    const rawRating = req.body.rating;
    const consentApproved = Boolean(req.body.consentApproved);

    // 1. Validasi Nama
    if (!rawName || rawName.length < 2) {
      return res.status(400).json({ error: 'Nama pemberi review wajib diisi (minimal 2 karakter).' });
    }
    if (rawName.length > 100) {
      return res.status(400).json({ error: 'Nama pemberi review maksimal 100 karakter.' });
    }

    // 2. Validasi Kategori
    if (rawCategory !== 'merchant' && rawCategory !== 'pelanggan' && rawCategory !== 'umkm') {
      return res.status(400).json({ error: 'Kategori ulasan tidak valid. Pilih Merchant atau Pelanggan.' });
    }
    const normalizedCategory = (rawCategory === 'merchant' || rawCategory === 'umkm') ? 'merchant' : 'pelanggan';

    // 3. Validasi Nama Usaha khusus Merchant
    if (normalizedCategory === 'merchant') {
      if (!rawMerchantName || rawMerchantName.length < 2) {
        return res.status(400).json({ error: 'Nama usaha atau merchant wajib diisi untuk ulasan merchant (minimal 2 karakter).' });
      }
      if (rawMerchantName.length > 100) {
        return res.status(400).json({ error: 'Nama usaha atau merchant maksimal 100 karakter.' });
      }
    }

    // 4. Validasi Rating Bintang (wajib berupa bilangan bulat 1 sampai 5)
    if (rawRating === undefined || rawRating === null || rawRating === '') {
      return res.status(400).json({ error: 'Rating bintang wajib dipilih (1 sampai 5).' });
    }
    const numRating = Number(rawRating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating harus berupa bilangan bulat antara 1 sampai 5.' });
    }

    // 5. Validasi Judul (Opsional)
    if (rawTitle && rawTitle.length > 100) {
      return res.status(400).json({ error: 'Judul review maksimal 100 karakter.' });
    }

    // 6. Validasi Isi Komentar
    if (!rawContent || rawContent.length < 10) {
      return res.status(400).json({ error: 'Isi komentar/pengalaman wajib diisi minimal 10 karakter.' });
    }
    if (rawContent.length > 1000) {
      return res.status(400).json({ error: 'Isi komentar/pengalaman maksimal 1000 karakter.' });
    }

    // 7. Validasi Persetujuan Pengalaman Nyata
    if (!consentApproved) {
      return res.status(400).json({ error: 'Anda harus menyetujui bahwa ulasan ini merupakan pengalaman nyata bersama TumpangGo.' });
    }

    const roleDetail = normalizedCategory === 'merchant'
      ? (rawMerchantName ? `Pemilik ${rawMerchantName}` : 'Mitra Kuliner Tumpang')
      : 'Pelanggan TumpangGo';

    // Simpan dengan status mutlak 'pending' (tidak boleh langsung dipublikasikan)
    const created = await foodDb.createTestimonial({
      userName: rawName,
      merchantName: normalizedCategory === 'merchant' ? rawMerchantName : undefined,
      category: normalizedCategory,
      title: rawTitle || undefined,
      content: rawContent,
      avatarUrl: undefined,
      roleDetail,
      rating: numRating,
      consentApproved: true,
      status: 'pending', // Menunggu kurasi admin
      displayOrder: 99
    });

    res.status(201).json({
      success: true,
      message: 'Review Anda berhasil dikirim dan sedang menunggu moderasi admin sebelum dipublikasikan.',
      testimonial: created,
      review: created
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Gagal mengirim review pengguna.' });
  }
};
adminRouter.post('/testimonials/submit', handleSubmitReview);
adminRouter.post('/reviews/submit', handleSubmitReview);

// Admin management routes (RBAC Admin & Master Admin)
const handleGetAdminReviews = (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const status = req.query.status as string | undefined;
    const list = foodDb.getAllTestimonials({ category, status });
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Gagal memuat daftar review admin.' });
  }
};
adminRouter.get('/admin/testimonials', requireRole(['ADMIN', 'MASTER_ADMIN']), handleGetAdminReviews);
adminRouter.get('/admin/reviews', requireRole(['ADMIN', 'MASTER_ADMIN']), handleGetAdminReviews);

const handleCreateAdminReview = async (req: Request, res: Response) => {
  try {
    const actorId = req.user?.userId || 'admin';
    const { userName, merchantName, title, category, content, avatarUrl, roleDetail, rating, consentApproved, status, displayOrder } = req.body;
    if (!userName || !content) {
      return res.status(400).json({ error: 'Nama dan isi review wajib diisi.' });
    }
    const rawCat = String(category || '').toLowerCase();
    const normalizedCategory = (rawCat === 'merchant' || rawCat === 'umkm') ? 'merchant' : 'pelanggan';
    const parsedRating = rating !== undefined && rating !== null ? Math.min(5, Math.max(1, Math.round(Number(rating)))) : undefined;
    const validStatus = ['published', 'pending', 'rejected', 'draft'].includes(status) ? status : 'published';

    const created = await foodDb.createTestimonial({
      userName: sanitizeInput(userName),
      merchantName: merchantName ? sanitizeInput(merchantName) : undefined,
      category: normalizedCategory,
      title: title ? sanitizeInput(title) : undefined,
      content: sanitizeInput(content),
      avatarUrl: avatarUrl?.trim() || undefined,
      roleDetail: roleDetail ? sanitizeInput(roleDetail) : undefined,
      rating: parsedRating,
      consentApproved: Boolean(consentApproved),
      status: validStatus,
      displayOrder: Number(displayOrder) || 1
    });
    foodDb.log(actorId, `Created review ${created.id} for ${created.userName} (${created.category})`, 'ADMIN');
    res.status(201).json(created);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
adminRouter.post('/admin/testimonials', requireRole(['ADMIN', 'MASTER_ADMIN']), handleCreateAdminReview);
adminRouter.post('/admin/reviews', requireRole(['ADMIN', 'MASTER_ADMIN']), handleCreateAdminReview);

const handleUpdateAdminReview = async (req: Request, res: Response) => {
  try {
    const actorId = req.user?.userId || 'admin';
    const payload = { ...req.body };
    if (payload.userName) payload.userName = sanitizeInput(payload.userName);
    if (payload.merchantName !== undefined) payload.merchantName = payload.merchantName ? sanitizeInput(payload.merchantName) : undefined;
    if (payload.title !== undefined) payload.title = payload.title ? sanitizeInput(payload.title) : undefined;
    if (payload.content) payload.content = sanitizeInput(payload.content);
    if (payload.roleDetail !== undefined) payload.roleDetail = payload.roleDetail ? sanitizeInput(payload.roleDetail) : undefined;

    const updated = await foodDb.updateTestimonial(req.params.id, payload);
    if (!updated) {
      return res.status(404).json({ error: 'Review tidak ditemukan.' });
    }
    foodDb.log(actorId, `Updated review ${req.params.id} (Status: ${updated.status})`, 'ADMIN');
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
adminRouter.put('/admin/testimonials/:id', requireRole(['ADMIN', 'MASTER_ADMIN']), handleUpdateAdminReview);
adminRouter.put('/admin/reviews/:id', requireRole(['ADMIN', 'MASTER_ADMIN']), handleUpdateAdminReview);

const handleDeleteAdminReview = async (req: Request, res: Response) => {
  try {
    const actorId = req.user?.userId || 'admin';
    const deleted = await foodDb.deleteTestimonial(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Review tidak ditemukan.' });
    }
    foodDb.log(actorId, `Deleted review ${req.params.id}`, 'ADMIN');
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
adminRouter.delete('/admin/testimonials/:id', requireRole(['ADMIN', 'MASTER_ADMIN']), handleDeleteAdminReview);
adminRouter.delete('/admin/reviews/:id', requireRole(['ADMIN', 'MASTER_ADMIN']), handleDeleteAdminReview);

