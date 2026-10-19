/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Administrative Routes
 * Manages system parameters, partner onboarding, payouts, and licenses.
 * Strictly protected with Admin-only RBAC middleware.
 */

import { Router, Request, Response } from 'express';
import { foodDb } from '../db';
import { requireRole } from '../auth';

export const adminRouter = Router();

// --- SYSTEM CONFIG ---
// Public read for customer fee calculations and QRIS display
adminRouter.get('/config', (req: Request, res: Response) => {
  res.json(foodDb.getConfig());
});

adminRouter.put('/config', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  const { userId, ...updates } = req.body;
  try {
    const config = await foodDb.updateConfig(req.user?.userId || userId || 'admin', updates);
    res.json(config);
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

adminRouter.put('/partner-registrations/:id/approve', requireRole(['ADMIN']), async (req: Request, res: Response) => {
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
});

adminRouter.post('/partner-registrations/:id/reject', requireRole(['ADMIN']), async (req: Request, res: Response) => {
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
});

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

// --- AUDIT LOGS (Admin Only) ---
adminRouter.get('/logs', requireRole(['ADMIN']), (req: Request, res: Response) => {
  res.json(foodDb.getLogs());
});

// --- CERITA PENGGUNA / TESTIMONIALS ---
// Public read - only approved and published testimonials for homepage
adminRouter.get('/testimonials', (req: Request, res: Response) => {
  try {
    const list = foodDb.getPublishedTestimonials();
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Gagal memuat cerita pengguna' });
  }
});

// Public submission - users/merchants submit experience for admin review
adminRouter.post('/testimonials/submit', async (req: Request, res: Response) => {
  try {
    const { userName, category, content, avatarUrl, roleDetail, consentApproved } = req.body;
    if (!userName || typeof userName !== 'string' || !userName.trim()) {
      return res.status(400).json({ error: 'Nama pengguna wajib diisi.' });
    }
    if (category !== 'umkm' && category !== 'pelanggan') {
      return res.status(400).json({ error: 'Kategori harus berupa "umkm" atau "pelanggan".' });
    }
    if (!content || typeof content !== 'string' || content.trim().length < 10) {
      return res.status(400).json({ error: 'Isi cerita minimal 10 karakter.' });
    }
    if (!consentApproved) {
      return res.status(400).json({ error: 'Persetujuan publikasi wajib disetujui.' });
    }

    const created = await foodDb.createTestimonial({
      userName: userName.trim(),
      category,
      content: content.trim(),
      avatarUrl: avatarUrl?.trim() || undefined,
      roleDetail: roleDetail?.trim() || undefined,
      consentApproved: Boolean(consentApproved),
      status: 'draft', // Always draft initially until reviewed and approved by admin
      displayOrder: 99
    });

    res.status(201).json({
      success: true,
      message: 'Cerita Anda berhasil dikirim dan akan diverifikasi oleh admin sebelum dipublikasikan.',
      testimonial: created
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Gagal mengirim cerita pengguna.' });
  }
});

// Admin management routes
adminRouter.get('/admin/testimonials', requireRole(['ADMIN']), (req: Request, res: Response) => {
  try {
    const list = foodDb.getAllTestimonials();
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Gagal memuat daftar testimoni admin.' });
  }
});

adminRouter.post('/admin/testimonials', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const actorId = req.user?.userId || 'admin';
    const { userName, category, content, avatarUrl, roleDetail, consentApproved, status, displayOrder } = req.body;
    if (!userName || !content) {
      return res.status(400).json({ error: 'Nama dan isi testimoni wajib diisi.' });
    }
    const created = await foodDb.createTestimonial({
      userName: userName.trim(),
      category: category === 'umkm' ? 'umkm' : 'pelanggan',
      content: content.trim(),
      avatarUrl: avatarUrl?.trim() || undefined,
      roleDetail: roleDetail?.trim() || undefined,
      consentApproved: Boolean(consentApproved),
      status: status === 'published' ? 'published' : 'draft',
      displayOrder: Number(displayOrder) || 1
    });
    foodDb.log(actorId, `Created testimonial ${created.id} for ${created.userName}`, 'ADMIN');
    res.status(201).json(created);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.put('/admin/testimonials/:id', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const actorId = req.user?.userId || 'admin';
    const updated = await foodDb.updateTestimonial(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Testimoni tidak ditemukan.' });
    }
    foodDb.log(actorId, `Updated testimonial ${req.params.id}`, 'ADMIN');
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

adminRouter.delete('/admin/testimonials/:id', requireRole(['ADMIN']), async (req: Request, res: Response) => {
  try {
    const actorId = req.user?.userId || 'admin';
    const deleted = await foodDb.deleteTestimonial(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Testimoni tidak ditemukan.' });
    }
    foodDb.log(actorId, `Deleted testimonial ${req.params.id}`, 'ADMIN');
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

