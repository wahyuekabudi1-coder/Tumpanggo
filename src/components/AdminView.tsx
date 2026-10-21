/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Admin Dashboard
 * Comprehensive operational management portal for system administration,
 * order tracking, payment verification, partner governance, and financial settlements.
 */

import React, { useState, useEffect } from 'react';
import { 
  Order, OrderStatus, PaymentStatus, Merchant, Driver, Settlement, SettlementStatus, SystemConfig, Testimonial 
} from '../types.ts';
import { safeStorage } from '../utils/safeStorage.ts';
import { compressImage } from '../utils/imageCompressor.ts';
import { apiFetch as fetch, extractArrayResponse } from '../utils/apiClient.ts';
import { 
  ShieldCheck, CheckSquare, ClipboardList, Store, Users, DollarSign, Settings, 
  Check, X, FileText, AlertTriangle, Truck, RefreshCw, ZoomIn, Eye,
  UserPlus, Search, ArrowUpRight, Clock, Phone, MapPin, Building,
  CheckCircle2, XCircle, ChevronRight, Sliders, ArrowDownRight, Wallet, LogOut,
  QrCode, ExternalLink, Trash2, Upload, Quote, Star, Filter, Receipt,
  Copy, Share2
} from 'lucide-react';
import EReceiptModal from './EReceiptModal.tsx';
import { useHiddenTrigger } from '../hooks/useHiddenTrigger.ts';
import HiddenPortalBar from './HiddenPortalBar.tsx';
import { useSEO } from '../hooks/useSEO.ts';

interface AdminViewProps {
  onLogout: () => void;
  systemConfig: SystemConfig;
  onUpdateConfig: (config: SystemConfig) => void;
  onSelectRole?: (role: 'CUSTOMER' | 'MERCHANT' | 'DRIVER' | 'ADMIN') => void;
}

export default function AdminView({ onLogout, systemConfig, onUpdateConfig, onSelectRole }: AdminViewProps) {
  useSEO({
    title: 'Dashboard Admin – TumpangGo Internal',
    isNoIndex: true
  });
  const { isUnlocked, handleCopyrightClick } = useHiddenTrigger();
  // Tabs: 'verify' | 'orders' | 'merchants' | 'drivers' | 'partners' | 'settlements' | 'settings' | 'testimonials'
  const [activeTab, setActiveTab] = useState<'verify' | 'orders' | 'merchants' | 'drivers' | 'partners' | 'settlements' | 'settings' | 'testimonials'>('verify');
  const [orders, setOrders] = useState<Order[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [partnerRegistrations, setPartnerRegistrations] = useState<any[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);

  // States for adding / editing reviews in admin
  const [showAddTestiForm, setShowAddTestiForm] = useState(false);
  const [editingTestiId, setEditingTestiId] = useState<string | null>(null);
  const [newTestiName, setNewTestiName] = useState('');
  const [newTestiMerchantName, setNewTestiMerchantName] = useState('');
  const [newTestiCategory, setNewTestiCategory] = useState<'merchant' | 'pelanggan'>('merchant');
  const [newTestiTitle, setNewTestiTitle] = useState('');
  const [newTestiRole, setNewTestiRole] = useState('');
  const [newTestiRating, setNewTestiRating] = useState<number>(5);
  const [newTestiContent, setNewTestiContent] = useState('');
  const [newTestiOrder, setNewTestiOrder] = useState<number>(1);
  const [newTestiStatus, setNewTestiStatus] = useState<'published' | 'pending' | 'rejected' | 'draft'>('published');
  const [newTestiConsent, setNewTestiConsent] = useState<boolean>(true);
  const [savingTesti, setSavingTesti] = useState(false);
  const [adminReviewCategoryFilter, setAdminReviewCategoryFilter] = useState<'all' | 'merchant' | 'pelanggan'>('all');
  const [adminReviewStatusFilter, setAdminReviewStatusFilter] = useState<'all' | 'published' | 'pending' | 'rejected' | 'draft'>('all');

  // Search & Filter
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const [merchantSearchQuery, setMerchantSearchQuery] = useState('');
  const [verifyFilter, setVerifyFilter] = useState<'WAITING' | 'ALL' | 'PAID' | 'REJECTED'>('WAITING');
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [copiedTrackingLink, setCopiedTrackingLink] = useState<string | null>(null);

  const handleCopyOrderNumber = async (orderNum: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(orderNum);
      }
      setCopiedOrderId(orderNum);
      setTimeout(() => setCopiedOrderId(null), 2500);
    } catch {}
  };

  const handleCopyTrackingLink = async (orderNum: string) => {
    try {
      const trackingUrl = `${window.location.origin}/?track=${encodeURIComponent(orderNum)}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(trackingUrl);
      }
      setCopiedTrackingLink(orderNum);
      setTimeout(() => setCopiedTrackingLink(null), 2500);
    } catch {}
  };

  // States for editing merchant email
  const [editingMerchantId, setEditingMerchantId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // States for editing driver email
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [editingDriverEmail, setEditingDriverEmail] = useState('');
  const [savingDriverEmail, setSavingDriverEmail] = useState(false);

  // Modal / Selection states
  const [paymentRejectModal, setPaymentRejectModal] = useState<{ orderId: string; reason: string } | null>(null);
  const [assignDriverModal, setAssignDriverModal] = useState<{ orderId: string; selectedDriverId: string } | null>(null);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);
  const [verifyingOrderId, setVerifyingOrderId] = useState<string | null>(null);

  // Admin Merchant QRIS Management Modal states
  const [adminQrisModal, setAdminQrisModal] = useState<{ merchant: Merchant; qrisImage: string; preview: string | null } | null>(null);
  const [adminQrisFile, setAdminQrisFile] = useState<string | null>(null);
  const [savingAdminQris, setSavingAdminQris] = useState(false);
  const [adminQrisMsg, setAdminQrisMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Settlement creation form states
  const [selectedSettlementMerchantId, setSelectedSettlementMerchantId] = useState('');
  const [previewSettlement, setPreviewSettlement] = useState<{ orderCount: number; totalSales: number; commission: number; netAmount: number; eligibleOrders: Order[] } | null>(null);

  // Config settings form states
  const [qrisInput, setQrisInput] = useState(systemConfig.qrisImage || '');
  const [deliveryFeeInput, setDeliveryFeeInput] = useState(systemConfig.defaultDeliveryFee || 5000);
  const [serviceFeeInput, setServiceFeeInput] = useState(systemConfig.serviceFee || 2000);
  const [commissionPercentInput, setCommissionPercentInput] = useState(systemConfig.commissionPercent || 10);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [ordData, merData, drData, setData, prData, testiData] = await Promise.all([
        fetch('/api/orders').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/merchants').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/drivers').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/settlements').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/partner-registrations').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/admin/testimonials').then(r => r.ok ? r.json() : []).catch(() => [])
      ]);
      setOrders(extractArrayResponse<Order>(ordData, 'orders'));
      setMerchants(extractArrayResponse<Merchant>(merData, 'merchants'));
      setDrivers(extractArrayResponse<Driver>(drData, 'drivers'));
      setSettlements(extractArrayResponse<Settlement>(setData, 'settlements'));
      setPartnerRegistrations(extractArrayResponse<any>(prData, 'partnerRegistrations'));
      setTestimonials(extractArrayResponse<Testimonial>(testiData, 'testimonials'));
    } catch (e) {
      console.error('Failed to fetch admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleApprovePartner = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menyetujui pendaftaran mitra ini? Toko/Kurir baru akan otomatis aktif di sistem.')) return;
    try {
      const reg = partnerRegistrations.find(r => r.id === id);
      const res = await fetch(`/api/partner-registrations/${id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'admin' })
      });
      if (res.ok) {
        const approvedData = await res.json();
        const approvedReg = approvedData.registration;

        if (reg && reg.type === 'MERCHANT') {
          const simulatedEmail = {
            id: 'email_' + Math.random().toString(36).substr(2, 9),
            to: reg.email,
            from: 'Tumpang Go Admin <admin@tumpanggo.com>',
            subject: `🎉 Pendaftaran Toko ${approvedReg?.storeName || reg.storeName || reg.name} Disetujui!`,
            body: `Halo ${approvedReg?.name || reg.name},\n\nSelamat! Pendaftaran kemitraan Anda untuk "${approvedReg?.storeName || reg.storeName || (reg.name + ' Store')}" telah disetujui.\n\nAkun Anda telah aktif secara otomatis. Berikut adalah data akses portal merchant Anda:\n\nEmail: ${approvedReg?.email || reg.email}\nKata Sandi: ${approvedReg?.password || 'TF-1234'}\n\nSilakan masuk melalui portal merchant:\n${window.location.origin}/?role=merchant&id=${approvedReg?.storeId || ''}`,
            linkUrl: `?role=merchant&id=${approvedReg?.storeId || ''}`,
            createdAt: new Date().toISOString(),
            read: false
          };
          const existingEmailsStr = safeStorage.getItem('tumpang_simulated_emails') || '[]';
          const existingEmails = JSON.parse(existingEmailsStr);
          existingEmails.unshift(simulatedEmail);
          safeStorage.setItem('tumpang_simulated_emails', JSON.stringify(existingEmails));
          window.dispatchEvent(new Event('tumpang_new_email'));
        }

        alert(`Pendaftaran disetujui! Kata sandi baru: ${approvedReg?.password || 'Tersimpan otomatis'}.`);
        fetchAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal menyetujui pendaftaran.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat menyetujui pendaftaran.');
    }
  };

  const handleRejectPartner = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menolak pendaftaran mitra ini?')) return;
    try {
      const res = await fetch(`/api/partner-registrations/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'admin' })
      });
      if (res.ok) {
        alert('Pendaftaran telah ditolak.');
        fetchAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal menolak pendaftaran.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat menolak pendaftaran.');
    }
  };

  const handleSaveMerchantEmail = async (merchantId: string) => {
    setSavingEmail(true);
    try {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: editingEmail, userId: 'admin', role: 'ADMIN' })
      });
      if (res.ok) {
        setEditingMerchantId(null);
        setEditingEmail('');
        fetchAdminData();
      } else {
        alert('Gagal memperbarui email merchant.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat menyimpan email.');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSaveDriverEmail = async (driverId: string) => {
    setSavingDriverEmail(true);
    try {
      const res = await fetch(`/api/drivers/${driverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: editingDriverEmail, userId: 'admin', role: 'ADMIN' })
      });
      if (res.ok) {
        setEditingDriverId(null);
        setEditingDriverEmail('');
        fetchAdminData();
      } else {
        alert('Gagal memperbarui email driver.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan saat menyimpan email driver.');
    } finally {
      setSavingDriverEmail(false);
    }
  };

  const verifyPayment = async (orderId: string) => {
    if (verifyingOrderId) return;
    const cleanOrderId = String(orderId || '').trim();
    if (!cleanOrderId) {
      alert('ID pesanan tidak valid.');
      return;
    }
    try {
      setVerifyingOrderId(cleanOrderId);
      const res = await fetch(`/api/orders/${encodeURIComponent(cleanOrderId)}/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'ADMIN' })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchAdminData();
      } else {
        alert(data.error || 'Gagal memverifikasi pembayaran.');
      }
    } catch (e: any) {
      console.error('Error verifying payment:', e);
      alert('Terjadi kesalahan saat memverifikasi pembayaran: ' + (e.message || 'Error'));
    } finally {
      setVerifyingOrderId(null);
    }
  };

  const rejectPayment = async (orderId: string, reason: string) => {
    const cleanOrderId = String(orderId || '').trim();
    if (!cleanOrderId) {
      alert('ID pesanan tidak valid.');
      return;
    }
    if (!reason || !reason.trim()) {
      alert('Alasan penolakan bukti pembayaran wajib diisi.');
      return;
    }
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(cleanOrderId)}/reject-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reason: reason.trim(),
          role: 'ADMIN' 
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPaymentRejectModal(null);
        await fetchAdminData();
        alert('Bukti pembayaran ditolak. Pelanggan akan mendapatkan rincian alasan penolakan dan dapat mengunggah bukti baru.');
      } else {
        alert(data.error || 'Gagal menolak bukti pembayaran.');
      }
    } catch (e: any) {
      console.error('Error rejecting payment:', e);
      alert('Terjadi kesalahan saat menolak pembayaran: ' + (e.message || 'Error'));
    }
  };

  const handleAdminQrisFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setAdminQrisMsg({ type: 'error', text: 'Format file tidak didukung. Mohon unggah file gambar (JPG, PNG, atau WebP).' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAdminQrisMsg({ type: 'error', text: 'Ukuran file gambar QRIS melebihi batas 5MB.' });
      return;
    }

    try {
      const compressed = await compressImage(file, 1000, 0.85);
      setAdminQrisFile(compressed);
      setAdminQrisMsg(null);
    } catch (err) {
      console.error(err);
      setAdminQrisMsg({ type: 'error', text: 'Gagal memproses gambar QRIS.' });
    }
  };

  const handleAdminSaveMerchantQris = async (merchantId: string) => {
    if (!adminQrisFile) {
      setAdminQrisMsg({ type: 'error', text: 'Pilih file gambar QRIS terlebih dahulu.' });
      return;
    }

    setSavingAdminQris(true);
    setAdminQrisMsg(null);
    try {
      const res = await fetch(`/api/merchants/${merchantId}/qris`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrisImage: adminQrisFile, role: 'ADMIN' })
      });
      const data = await res.json();
      if (res.ok) {
        alert('QRIS statis merchant berhasil disimpan!');
        setAdminQrisModal(null);
        setAdminQrisFile(null);
        fetchAdminData();
      } else {
        setAdminQrisMsg({ type: 'error', text: data.error || 'Gagal menyimpan QRIS merchant.' });
      }
    } catch (e: any) {
      console.error(e);
      setAdminQrisMsg({ type: 'error', text: e.message || 'Terjadi kesalahan saat menyimpan QRIS.' });
    } finally {
      setSavingAdminQris(false);
    }
  };

  const handleAdminDeleteMerchantQris = async (merchantId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus QRIS statis merchant ini?')) return;

    setSavingAdminQris(true);
    try {
      const res = await fetch(`/api/merchants/${merchantId}/qris`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'ADMIN' })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert('QRIS statis merchant berhasil dihapus.');
        setAdminQrisModal(null);
        setAdminQrisFile(null);
        fetchAdminData();
      } else {
        alert(data.error || 'Gagal menghapus QRIS merchant.');
      }
    } catch (e: any) {
      console.error(e);
      alert('Terjadi kesalahan saat menghapus QRIS.');
    } finally {
      setSavingAdminQris(false);
    }
  };

  const assignDriver = async (orderId: string, driverId: string) => {
    if (!driverId) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/assign-driver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId })
      });
      if (res.ok) {
        setAssignDriverModal(null);
        fetchAdminData();
        alert('Driver berhasil ditugaskan ke pesanan ini!');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMerchantSelectForSettlement = (merchantId: string) => {
    setSelectedSettlementMerchantId(merchantId);
    if (!merchantId) {
      setPreviewSettlement(null);
      return;
    }

    const eligible = (Array.isArray(orders) ? orders : []).filter(o => 
      o &&
      o.merchantId === merchantId && 
      o.status === OrderStatus.COMPLETED && 
      !(o as any).settlementId
    );

    const totalSales = eligible.reduce((sum, o) => sum + o.subtotal, 0);
    const commission = Math.round(totalSales * ((systemConfig.commissionPercent || 10) / 100));
    const netAmount = totalSales - commission;

    setPreviewSettlement({
      orderCount: eligible.length,
      totalSales,
      commission,
      netAmount,
      eligibleOrders: eligible
    });
  };

  const createSettlement = async () => {
    if (!selectedSettlementMerchantId || !previewSettlement || previewSettlement.orderCount === 0) {
      alert('Tidak ada transaksi selesai yang dapat dicairkan.');
      return;
    }

    try {
      const res = await fetch('/api/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: selectedSettlementMerchantId,
          orderIds: previewSettlement.eligibleOrders.map(o => o.id),
          totalSales: previewSettlement.totalSales,
          totalCommission: previewSettlement.commission,
          amountToPay: previewSettlement.netAmount,
          orderCount: previewSettlement.orderCount
        })
      });

      if (res.ok) {
        alert('Settlement pencairan dana berhasil dibuat dengan status MENUNGGU TRANSFER!');
        setSelectedSettlementMerchantId('');
        setPreviewSettlement(null);
        fetchAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const completeSettlementTransfer = async (settlementId: string) => {
    if (!confirm('Tandai settlement ini telah ditransfer ke rekening merchant?')) return;
    try {
      const res = await fetch(`/api/settlements/${settlementId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: SettlementStatus.SETTLEMENT_COMPLETED })
      });
      if (res.ok) {
        fetchAdminData();
        alert('Status settlement diperbarui menjadi TELAH DITRANSFER!');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const newConfig: SystemConfig = {
        ...systemConfig,
        qrisImage: qrisInput,
        defaultDeliveryFee: Number(deliveryFeeInput),
        serviceFee: Number(serviceFeeInput),
        commissionPercent: Number(commissionPercentInput)
      };
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdateConfig(updated);
        alert('Konfigurasi sistem operasional berhasil diperbarui!');
      } else {
        alert('Gagal menyimpan konfigurasi.');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingConfig(false);
    }
  };

  // Metrics
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safePartnerRegs = Array.isArray(partnerRegistrations) ? partnerRegistrations : [];
  const safeMerchants = Array.isArray(merchants) ? merchants : [];

  const pendingVerificationOrders = safeOrders.filter(o => o && (o.status === OrderStatus.WAITING_PAYMENT_VERIFICATION || o.paymentStatus === PaymentStatus.WAITING_VERIFICATION));
  const paidOrders = safeOrders.filter(o => o && (o.paymentStatus === PaymentStatus.PAID || o.status === OrderStatus.PAYMENT_VERIFIED));
  const rejectedOrders = safeOrders.filter(o => o && (o.paymentStatus === PaymentStatus.REJECTED || o.status === OrderStatus.PAYMENT_REJECTED));
  const activeOrders = safeOrders.filter(o => 
    o && [OrderStatus.COOKING, OrderStatus.READY_FOR_PICKUP, OrderStatus.ORDER_PICKED_UP].includes(o.status)
  );
  const completedOrders = safeOrders.filter(o => o && o.status === OrderStatus.COMPLETED);
  const pendingPartnerRegs = safePartnerRegs.filter(r => r && r.status === 'PENDING');
  const totalGrossRevenue = completedOrders.reduce((sum, o) => sum + (o?.total || 0), 0);
  const totalPlatformCommission = Math.round(completedOrders.reduce((sum, o) => sum + (o?.subtotal || 0) * 0.1, 0));

  const filteredVerifyOrders = safeOrders.filter(o => {
    if (!o) return false;
    let matchStatus = false;
    if (verifyFilter === 'WAITING') {
      matchStatus = o.status === OrderStatus.WAITING_PAYMENT_VERIFICATION || o.paymentStatus === PaymentStatus.WAITING_VERIFICATION;
    } else if (verifyFilter === 'PAID') {
      matchStatus = o.paymentStatus === PaymentStatus.PAID || o.status === OrderStatus.PAYMENT_VERIFIED;
    } else if (verifyFilter === 'REJECTED') {
      matchStatus = o.paymentStatus === PaymentStatus.REJECTED || o.status === OrderStatus.PAYMENT_REJECTED;
    } else {
      matchStatus = Boolean(o.paymentProof) || [OrderStatus.WAITING_PAYMENT_VERIFICATION, OrderStatus.PAYMENT_VERIFIED, OrderStatus.PAYMENT_REJECTED].includes(o.status);
    }
    const matchQuery = orderSearchQuery === '' || 
      (o.id || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      (o.orderNumber || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      (o.customerPhone || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      (o.customerName || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      (o.merchantName || '').toLowerCase().includes(orderSearchQuery.toLowerCase());
    return matchStatus && matchQuery;
  });

  const filteredOrders = safeOrders.filter(o => {
    if (!o) return false;
    const matchQuery = orderSearchQuery === '' || 
      (o.id || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      (o.orderNumber || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      (o.customerPhone || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      (o.customerName || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      (o.merchantName || '').toLowerCase().includes(orderSearchQuery.toLowerCase());
    const matchStatus = orderStatusFilter === 'ALL' || o.status === orderStatusFilter;
    return matchQuery && matchStatus;
  });

  const filteredMerchants = safeMerchants.filter(m => 
    m && (
      merchantSearchQuery === '' ||
      (m.name || '').toLowerCase().includes(merchantSearchQuery.toLowerCase()) ||
      (m.ownerName || '').toLowerCase().includes(merchantSearchQuery.toLowerCase()) ||
      (m.category && m.category.toLowerCase().includes(merchantSearchQuery.toLowerCase()))
    )
  );

  const handleUpdateReviewStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/testimonials/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: newStatus,
          consentApproved: newStatus === 'published' ? true : undefined
        })
      });
      if (res.ok) {
        fetchAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal mengubah status review');
      }
    } catch (e: any) {
      alert('Terjadi kesalahan: ' + e.message);
    }
  };

  const handleToggleConsentTestimonial = async (id: string, currentConsent: boolean) => {
    try {
      const res = await fetch(`/api/admin/testimonials/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentApproved: !currentConsent })
      });
      if (res.ok) {
        fetchAdminData();
      }
    } catch (e: any) {
      alert('Terjadi kesalahan: ' + e.message);
    }
  };

  const handleDeleteTestimonial = async (id: string) => {
    if (!confirm('Hapus review pengguna ini secara permanen?')) return;
    try {
      const res = await fetch(`/api/admin/testimonials/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchAdminData();
      }
    } catch (e: any) {
      alert('Terjadi kesalahan: ' + e.message);
    }
  };

  const handleSaveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTestiName.trim() || !newTestiContent.trim()) {
      alert('Nama dan isi review wajib diisi');
      return;
    }
    setSavingTesti(true);
    try {
      const url = editingTestiId ? `/api/admin/testimonials/${editingTestiId}` : '/api/admin/testimonials';
      const method = editingTestiId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: newTestiName.trim(),
          merchantName: newTestiCategory === 'merchant' ? (newTestiMerchantName.trim() || undefined) : undefined,
          category: newTestiCategory,
          title: newTestiTitle.trim() || undefined,
          roleDetail: newTestiRole.trim() || undefined,
          rating: newTestiRating > 0 ? newTestiRating : undefined,
          content: newTestiContent.trim(),
          displayOrder: Number(newTestiOrder) || 1,
          status: newTestiStatus,
          consentApproved: newTestiConsent
        })
      });
      if (res.ok) {
        setShowAddTestiForm(false);
        setEditingTestiId(null);
        setNewTestiName('');
        setNewTestiMerchantName('');
        setNewTestiTitle('');
        setNewTestiRole('');
        setNewTestiContent('');
        setNewTestiRating(5);
        setNewTestiOrder(1);
        fetchAdminData();
      } else {
        const err = await res.json();
        alert(err.error || 'Gagal menyimpan review');
      }
    } catch (e: any) {
      alert('Terjadi kesalahan: ' + e.message);
    } finally {
      setSavingTesti(false);
    }
  };

  const handleStartEditReview = (testi: Testimonial) => {
    setEditingTestiId(testi.id);
    setNewTestiName(testi.userName);
    setNewTestiMerchantName(testi.merchantName || '');
    setNewTestiTitle(testi.title || '');
    setNewTestiCategory((testi.category === 'merchant' || testi.category === 'umkm') ? 'merchant' : 'pelanggan');
    setNewTestiRole(testi.roleDetail || '');
    setNewTestiRating(testi.rating || 5);
    setNewTestiContent(testi.content);
    setNewTestiOrder(testi.displayOrder || 1);
    setNewTestiStatus(testi.status || 'published');
    setNewTestiConsent(testi.consentApproved ?? true);
    setShowAddTestiForm(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white flex items-center justify-center shadow-sm font-display font-extrabold text-lg">
              tG
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-bold text-base sm:text-lg text-slate-900 tracking-tight">Admin Portal</h1>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                  TumpangGo
                </span>
              </div>
              <p className="text-xs text-slate-500">Pusat Kendali Operasional & Keuangan</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchAdminData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all cursor-pointer shadow-xs"
              title="Perbarui data"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              Keluar
            </button>
          </div>
        </div>

        {/* KPI Summary Strip */}
        <div className="border-t border-slate-100 bg-emerald-950 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 divide-y md:divide-y-0 md:divide-x divide-emerald-900/60">
              <div className="flex items-center gap-3 pt-2 md:pt-0">
                <div className="w-9 h-9 rounded-lg bg-emerald-900/80 border border-emerald-700/50 flex items-center justify-center text-emerald-300">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">Verifikasi Pending</span>
                  <span className="font-display font-extrabold text-lg text-white">
                    {pendingVerificationOrders.length}
                    {pendingVerificationOrders.length > 0 && (
                      <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 md:pt-0 md:pl-4">
                <div className="w-9 h-9 rounded-lg bg-emerald-900/80 border border-emerald-700/50 flex items-center justify-center text-emerald-300">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">Pesanan Aktif</span>
                  <span className="font-display font-extrabold text-lg text-white">{activeOrders.length}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 md:pt-0 md:pl-4">
                <div className="w-9 h-9 rounded-lg bg-emerald-900/80 border border-emerald-700/50 flex items-center justify-center text-emerald-300">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">Total Omset Selesai</span>
                  <span className="font-display font-bold text-base text-white">Rp {totalGrossRevenue.toLocaleString('id-ID')}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 md:pt-0 md:pl-4">
                <div className="w-9 h-9 rounded-lg bg-emerald-900/80 border border-emerald-700/50 flex items-center justify-center text-emerald-300">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">Est. Komisi Platform</span>
                  <span className="font-display font-bold text-base text-emerald-300">Rp {totalPlatformCommission.toLocaleString('id-ID')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2.5 scrollbar-none" aria-label="Tabs">
            {[
              { id: 'verify', label: 'Verifikasi Pembayaran', count: pendingVerificationOrders.length, icon: CheckSquare },
              { id: 'orders', label: 'Kelola Pesanan', count: orders.length, icon: ClipboardList },
              { id: 'merchants', label: 'Mitra Merchant', count: merchants.length, icon: Store },
              { id: 'drivers', label: 'Mitra Driver', count: drivers.length, icon: Users },
              { id: 'partners', label: 'Pendaftaran Mitra', count: pendingPartnerRegs.length, icon: UserPlus },
              { id: 'settlements', label: 'Settlement & Payout', count: settlements.length, icon: DollarSign },
              { id: 'testimonials', label: 'Review Pengguna', count: testimonials.filter(t => t.status === 'pending' || t.status === 'draft').length, icon: Quote },
              { id: 'settings', label: 'Pengaturan Sistem', icon: Settings },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    isActive 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-white text-emerald-800' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">

        {/* 1. TAB: VERIFIKASI PEMBAYARAN */}
        {activeTab === 'verify' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Verifikasi Pembayaran QRIS Statis</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tinjau bukti transfer pembayaran QRIS pelanggan. Pastikan nominal transfer dan 3 digit kode unik sesuai sebelum menyetujui.
                </p>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'WAITING', label: 'Menunggu Verifikasi', count: pendingVerificationOrders.length },
                  { id: 'ALL', label: 'Semua Bukti', count: safeOrders.filter(o => o?.paymentProof).length },
                  { id: 'PAID', label: 'Lunas (PAID)', count: paidOrders.length },
                  { id: 'REJECTED', label: 'Ditolak (REJECTED)', count: rejectedOrders.length },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setVerifyFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      verifyFilter === f.id 
                        ? 'bg-slate-900 text-white shadow-xs' 
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <span>{f.label}</span>
                    {f.count !== undefined && (
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                        verifyFilter === f.id ? 'bg-white text-slate-900' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {f.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {filteredVerifyOrders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="font-display font-bold text-base text-slate-900">
                  {verifyFilter === 'WAITING' ? 'Semua Pembayaran Telah Bersih' : 'Tidak Ada Transaksi Ditemukan'}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  {verifyFilter === 'WAITING' 
                    ? 'Tidak ada bukti pembayaran baru yang menunggu verifikasi admin saat ini. Pesanan baru akan otomatis muncul di sini.'
                    : 'Tidak ada data pesanan yang sesuai dengan filter verifikasi yang dipilih.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredVerifyOrders.map(order => {
                  const isWaiting = order.status === OrderStatus.WAITING_PAYMENT_VERIFICATION || order.paymentStatus === PaymentStatus.WAITING_VERIFICATION;
                  const isPaid = order.paymentStatus === PaymentStatus.PAID || order.status === OrderStatus.PAYMENT_VERIFIED;
                  const isRejected = order.paymentStatus === PaymentStatus.REJECTED || order.status === OrderStatus.PAYMENT_REJECTED;

                  return (
                    <div key={order.id} className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col justify-between hover:border-emerald-300 transition-all">
                      <div>
                        {/* Card Header */}
                        <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs font-bold text-slate-800">#{order.orderNumber || order.id}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyOrderNumber(order.orderNumber || order.id)}
                                title="Salin Nomor Order"
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-white hover:bg-slate-100 text-slate-600 rounded border border-slate-200 transition-colors cursor-pointer"
                              >
                                {copiedOrderId === (order.orderNumber || order.id) ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span className="text-emerald-700 font-bold">Disalin</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 text-slate-400" />
                                    <span>Salin</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyTrackingLink(order.orderNumber || order.id)}
                                title="Salin Tautan Pelacakan Pesanan"
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition-colors cursor-pointer"
                              >
                                {copiedTrackingLink === (order.orderNumber || order.id) ? (
                                  <>
                                    <Check className="w-3 h-3 text-blue-600" />
                                    <span className="font-bold">Tautan Disalin</span>
                                  </>
                                ) : (
                                  <>
                                    <Share2 className="w-3 h-3 text-blue-500" />
                                    <span>Tautan</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                              {new Date(order.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, {new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                            </span>
                          </div>
                          {isWaiting ? (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                              Perlu Verifikasi
                            </span>
                          ) : isPaid ? (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                              <Check className="w-3 h-3 text-emerald-600" />
                              LUNAS (PAID)
                            </span>
                          ) : isRejected ? (
                            <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-rose-200 flex items-center gap-1">
                              <X className="w-3 h-3 text-rose-600" />
                              DITOLAK (REJECTED)
                            </span>
                          ) : (
                            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                              {order.paymentStatus || order.status}
                            </span>
                          )}
                        </div>

                        {/* Customer & Merchant Info */}
                        <div className="p-4 space-y-3">
                          <div className="flex justify-between items-start text-xs pb-3 border-b border-slate-100">
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pelanggan</span>
                              <span className="font-bold text-slate-800">{order.customerName}</span>
                              <span className="text-[11px] text-slate-500 block">{order.customerPhone}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Toko Merchant</span>
                              <span className="font-bold text-emerald-800">{order.merchantName}</span>
                              <span className="text-[10px] text-slate-400 block">QRIS Statis Toko</span>
                            </div>
                          </div>

                          {/* Order Items Preview */}
                          <div className="bg-slate-50 rounded-xl p-2.5 space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Rincian Menu</span>
                            {order.items.map((it, idx) => (
                              <div key={idx} className="flex justify-between text-xs text-slate-600">
                                <span>{it.quantity}x {it.name}</span>
                                <span className="font-mono font-medium">Rp {(it.price * it.quantity).toLocaleString('id-ID')}</span>
                              </div>
                            ))}
                          </div>

                          {/* Payment Breakdown */}
                          <div className="pt-1 text-xs space-y-1">
                            <div className="flex justify-between text-slate-500 text-[11px]">
                              <span>Subtotal Menu</span>
                              <span>Rp {order.subtotal.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex justify-between text-slate-500 text-[11px]">
                              <span>Ongkir + Biaya Layanan</span>
                              <span>Rp {(order.deliveryFee + order.serviceFee).toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex justify-between text-amber-700 font-bold text-[11px]">
                              <span>Kode Unik Verifikasi</span>
                              <span className="font-mono bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">+{order.uniqueCode}</span>
                            </div>
                            <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-1.5 border-t border-slate-200">
                              <span>Total Harus Dibayar</span>
                              <span className="font-mono text-emerald-700 text-base">Rp {order.total.toLocaleString('id-ID')}</span>
                            </div>
                          </div>

                          {/* Rejection notice if previously rejected */}
                          {order.paymentRejectionReason && (
                            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-0.5">
                              <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block">Alasan Penolakan:</span>
                              <p className="font-medium">{order.paymentRejectionReason}</p>
                            </div>
                          )}

                          {/* Proof Image Box */}
                          <div className="pt-2">
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                                Bukti Transfer QRIS Pelanggan
                              </span>
                              {order.paymentProofUploadedAt && (
                                <span className="text-[9px] text-slate-400 font-mono">
                                  Diunggah: {new Date(order.paymentProofUploadedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                </span>
                              )}
                            </div>
                            {order.paymentProof ? (
                              <div 
                                onClick={() => setShowImageModal(order.paymentProof || null)}
                                className="relative group cursor-pointer rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video flex items-center justify-center"
                              >
                                <img 
                                  src={order.paymentProof} 
                                  alt="Bukti Transfer" 
                                  className="w-full h-full object-contain group-hover:scale-105 transition-all duration-300"
                                />
                                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                                  <ZoomIn className="w-4 h-4" />
                                  Perbesar Bukti
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                                Bukti transfer belum diunggah oleh pelanggan.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons or Status Footer */}
                      <div className="p-4 bg-slate-50 border-t border-slate-100">
                        {isWaiting ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => verifyPayment(order.id)}
                              disabled={verifyingOrderId === order.id}
                              className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                            >
                              {verifyingOrderId === order.id ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  <span>Memverifikasi...</span>
                                </>
                              ) : (
                                <>
                                  <Check className="w-4 h-4" />
                                  <span>Verifikasi Pembayaran</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => setPaymentRejectModal({ orderId: order.id, reason: '' })}
                              disabled={verifyingOrderId === order.id}
                              className="py-2.5 px-3 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer"
                              title="Tolak Pembayaran"
                            >
                              <X className="w-4 h-4" />
                              Tolak Bukti
                            </button>
                          </div>
                        ) : isPaid ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                              <span className="font-bold flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                Lunas Terverifikasi
                              </span>
                              {order.receiptNumber ? (
                                <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                                  {order.receiptNumber}
                                </span>
                              ) : order.paymentVerifiedAt ? (
                                <span className="text-[10px] text-emerald-600 font-mono">
                                  {new Date(order.paymentVerifiedAt).toLocaleDateString('id-ID')}
                                </span>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedReceiptOrder(order)}
                              className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                            >
                              <Receipt className="w-3.5 h-3.5 text-amber-400" />
                              <span>Lihat & Unduh E-Receipt Resmi</span>
                            </button>
                          </div>
                        ) : isRejected ? (
                          <div className="flex items-center justify-between text-xs text-rose-800 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                            <span className="font-bold flex items-center gap-1">
                              <XCircle className="w-4 h-4 text-rose-600" />
                              Bukti Telah Ditolak
                            </span>
                            <span className="text-[10px] text-rose-600">Menunggu Bukti Baru</span>
                          </div>
                        ) : (
                          <div className="text-center text-xs text-slate-500 py-1">
                            Status: {order.status}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. TAB: KELOLA PESANAN */}
        {activeTab === 'orders' && (
          <div className="space-y-5">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Kelola Semua Pesanan</h2>
                <p className="text-xs text-slate-500 mt-0.5">Pantau status seluruh pesanan, penugasan driver, dan riwayat pesanan.</p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Cari ID, pelanggan, toko..."
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 w-48 sm:w-60"
                  />
                </div>

                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-medium"
                >
                  <option value="ALL">Semua Status</option>
                  <option value={OrderStatus.WAITING_PAYMENT}>Menunggu Pembayaran</option>
                  <option value={OrderStatus.WAITING_PAYMENT_VERIFICATION}>Perlu Verifikasi Admin</option>
                  <option value={OrderStatus.PAYMENT_VERIFIED}>Pembayaran Terverifikasi</option>
                  <option value={OrderStatus.COOKING}>Sedang Dimasak</option>
                  <option value={OrderStatus.READY_FOR_PICKUP}>Siap Diambil Kurir</option>
                  <option value={OrderStatus.ORDER_PICKED_UP}>Dalam Pengantaran</option>
                  <option value={OrderStatus.COMPLETED}>Selesai Diterima</option>
                  <option value={OrderStatus.PAYMENT_REJECTED}>Pembayaran Ditolak</option>
                  <option value={OrderStatus.CANCELLED}>Dibatalkan</option>
                </select>
              </div>
            </div>

            {/* Orders Table Container */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">Order ID & Waktu</th>
                      <th className="py-3 px-4">Pelanggan</th>
                      <th className="py-3 px-4">Toko & Menu</th>
                      <th className="py-3 px-4">Total</th>
                      <th className="py-3 px-4">Status Pesanan</th>
                      <th className="py-3 px-4">Driver Ditugaskan</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-400">
                          Tidak ditemukan pesanan dengan filter saat ini.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map(order => (
                        <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4 font-mono">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 block">#{order.orderNumber || order.id}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyOrderNumber(order.orderNumber || order.id)}
                                title="Salin Nomor Order"
                                className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                              >
                                {copiedOrderId === (order.orderNumber || order.id) ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyTrackingLink(order.orderNumber || order.id)}
                                title="Salin Tautan Pelacakan"
                                className="p-1 hover:bg-slate-200 text-slate-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                              >
                                {copiedTrackingLink === (order.orderNumber || order.id) ? (
                                  <Check className="w-3.5 h-3.5 text-blue-600" />
                                ) : (
                                  <Share2 className="w-3.5 h-3.5 text-blue-500" />
                                )}
                              </button>
                            </div>
                            <span className="text-[10px] text-slate-400 font-sans">
                              {new Date(order.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}{' '}
                              {new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="font-bold text-slate-800 block">{order.customerName}</span>
                            <span className="text-[11px] text-slate-500 block">{order.customerPhone}</span>
                            <span className="text-[10px] text-slate-400 line-clamp-1 max-w-[180px]">{order.deliveryAddress}</span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="font-bold text-emerald-800 block">{order.merchantName}</span>
                            <span className="text-[11px] text-slate-500">{order.items.length} item ({order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')})</span>
                          </td>

                          <td className="py-3.5 px-4 font-mono">
                            <span className="font-bold text-slate-900 block">Rp {order.total.toLocaleString('id-ID')}</span>
                            <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-0.5 mt-0.5 border border-emerald-200 font-sans">
                              <QrCode className="w-2.5 h-2.5" /> QRIS Statis Toko
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.8 rounded-full text-[10px] font-bold ${
                              order.status === OrderStatus.COMPLETED ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                              order.status === OrderStatus.WAITING_PAYMENT_VERIFICATION ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              order.status === OrderStatus.COOKING || order.status === OrderStatus.READY_FOR_PICKUP ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                              order.status === OrderStatus.PAYMENT_REJECTED || order.status === OrderStatus.CANCELLED ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                              'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {order.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            {order.driverName ? (
                              <div className="flex items-center gap-1.5 text-xs text-slate-700">
                                <Truck className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="font-bold">{order.driverName}</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => setAssignDriverModal({ orderId: order.id, selectedDriverId: drivers[0]?.id || '' })}
                                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-all"
                              >
                                + Tugaskan Driver
                              </button>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            {order.paymentProof && (
                              <button
                                onClick={() => setShowImageModal(order.paymentProof || null)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold mr-1.5"
                                title="Lihat Bukti Bayar"
                              >
                                <Eye className="w-3.5 h-3.5 text-slate-500" />
                                Bukti
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. TAB: MITRA MERCHANT */}
        {activeTab === 'merchants' && (
          <div className="space-y-5">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Daftar Mitra Toko & Resto</h2>
                <p className="text-xs text-slate-500 mt-0.5">Kelola status aktif merchant dan kredensial akses.</p>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nama toko, pemilik..."
                  value={merchantSearchQuery}
                  onChange={(e) => setMerchantSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 w-56"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredMerchants.map(m => (
                <div key={m.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between hover:border-emerald-200 transition-all">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0">
                        {m.image ? (
                          <img src={m.image} alt={m.name} className="w-full h-full object-cover" />
                        ) : (
                          <Store className="w-6 h-6 text-slate-400 m-3" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h3 className="font-display font-bold text-sm text-slate-900 truncate">{m.name}</h3>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            m.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {m.active ? 'Buka' : 'Tutup'}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 block truncate">Pemilik: {m.ownerName}</span>
                        <span className="text-[10px] text-slate-400 block">{m.category || 'Kuliner Tumpang'}</span>
                      </div>
                    </div>

                    {/* Operational Details */}
                    <div className="bg-slate-50 rounded-xl p-2.5 text-xs space-y-1">
                      <div className="flex justify-between text-slate-600">
                        <span>Jam Buka:</span>
                        <span className="font-bold">{m.openTime} - {m.closeTime}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Kontak WA:</span>
                        <span className="font-medium">{m.phone}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Bank Rekening:</span>
                        <span className="font-mono text-[11px]">{m.bankName} - {m.bankAccount}</span>
                      </div>
                    </div>

                    {/* Edit Merchant Email Section */}
                    <div className="pt-2 border-t border-slate-100">
                      {editingMerchantId === m.id ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="email"
                            value={editingEmail}
                            onChange={(e) => setEditingEmail(e.target.value)}
                            placeholder="Email login baru..."
                            className="flex-1 py-1 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveMerchantEmail(m.id)}
                            disabled={savingEmail}
                            className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                          >
                            Simpan
                          </button>
                          <button
                            onClick={() => setEditingMerchantId(null)}
                            className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="truncate">Email: <strong className="text-slate-700">{m.email || 'Belum diatur'}</strong></span>
                          <button
                            onClick={() => { setEditingMerchantId(m.id); setEditingEmail(m.email || ''); }}
                            className="text-emerald-700 font-bold hover:underline shrink-0"
                          >
                            Ubah Email
                          </button>
                        </div>
                      )}
                    </div>

                    {/* QRIS Statis Merchant Info & Action */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <QrCode className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        {m.qrisImage ? (
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              QRIS Terpasang
                            </span>
                            <button
                              onClick={() => setShowImageModal(m.qrisImage || null)}
                              className="text-[10px] text-slate-400 hover:text-emerald-700 underline flex items-center gap-0.5"
                            >
                              <ZoomIn className="w-2.5 h-2.5" /> Lihat
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            Belum Ada QRIS
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setAdminQrisModal({ merchant: m, qrisImage: m.qrisImage || '', preview: m.qrisImage || null });
                          setAdminQrisFile(null);
                          setAdminQrisMsg(null);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-all shrink-0 cursor-pointer"
                      >
                        <QrCode className="w-3 h-3" />
                        Kelola QRIS
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. TAB: MITRA DRIVER */}
        {activeTab === 'drivers' && (
          <div className="space-y-5">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Daftar Mitra Driver & Kurir</h2>
                <p className="text-xs text-slate-500 mt-0.5">Kelola armada pengantaran makanan dan kurir lokal Tumpang.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {drivers.map(d => (
                <div key={d.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 flex flex-col justify-between hover:border-emerald-200 transition-all">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center font-bold">
                          {d.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-display font-bold text-sm text-slate-900">{d.name}</h3>
                          <span className="text-[11px] text-slate-500 font-mono">{d.phone}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        d.online ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {d.online ? 'Online' : 'Offline'}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      {editingDriverId === d.id ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="email"
                            value={editingDriverEmail}
                            onChange={(e) => setEditingDriverEmail(e.target.value)}
                            placeholder="Email driver..."
                            className="flex-1 py-1 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveDriverEmail(d.id)}
                            disabled={savingDriverEmail}
                            className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                          >
                            Simpan
                          </button>
                          <button
                            onClick={() => setEditingDriverId(null)}
                            className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="truncate">Email: <strong className="text-slate-700">{d.email || 'Belum diatur'}</strong></span>
                          <button
                            onClick={() => { setEditingDriverId(d.id); setEditingDriverEmail(d.email || ''); }}
                            className="text-emerald-700 font-bold hover:underline shrink-0"
                          >
                            Ubah Email
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. TAB: PENDAFTARAN MITRA */}
        {activeTab === 'partners' && (
          <div className="space-y-5">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Pengajuan Pendaftaran Mitra</h2>
                <p className="text-xs text-slate-500 mt-0.5">Tinjau calon mitra merchant atau driver yang mendaftar secara online.</p>
              </div>
              <span className="text-xs font-bold px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full">
                {partnerRegistrations.length} Total Pendaftar
              </span>
            </div>

            {partnerRegistrations.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
                <UserPlus className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <h3 className="font-display font-bold text-base text-slate-800">Belum Ada Pendaftaran Baru</h3>
                <p className="text-xs text-slate-500 mt-1">Calon mitra yang mendaftar lewat formulir registrasi akan muncul di sini.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {partnerRegistrations.map(reg => (
                  <div key={reg.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          reg.type === 'MERCHANT' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          Mitra {reg.type}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          reg.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                          reg.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {reg.status}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-display font-bold text-sm text-slate-900">{reg.storeName || reg.name}</h3>
                        <p className="text-xs text-slate-600 mt-0.5">Pemilik/Penanggungjawab: <strong>{reg.name}</strong></p>
                        <p className="text-xs text-slate-500">WhatsApp: <span className="font-mono">{reg.phone}</span> | Email: {reg.email || '-'}</p>
                        {reg.storeAddress && (
                          <p className="text-xs text-slate-500 mt-1">Alamat: {reg.storeAddress}</p>
                        )}
                      </div>

                      {/* Documents inspection */}
                      <div className="flex items-center gap-2 pt-2">
                        {reg.businessPhoto && (
                          <button
                            onClick={() => setShowImageModal(reg.businessPhoto)}
                            className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg"
                          >
                            Foto Usaha/KTP
                          </button>
                        )}
                      </div>
                    </div>

                    {reg.status === 'PENDING' && (
                      <div className="pt-4 border-t border-slate-100 flex items-center gap-2 mt-3">
                        <button
                          onClick={() => handleApprovePartner(reg.id)}
                          className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                        >
                          Setujui & Buat Akun
                        </button>
                        <button
                          onClick={() => handleRejectPartner(reg.id)}
                          className="py-2 px-3 rounded-xl border border-rose-200 text-rose-600 font-bold text-xs hover:bg-rose-50"
                        >
                          Tolak
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6. TAB: SETTLEMENT & PAYOUT */}
        {activeTab === 'settlements' && (
          <div className="space-y-6">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Pencairan Dana (Settlement) Merchant</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hitung dan cairkan hasil penjualan pesanan selesai kepada rekening bank merchant setelah dipotong komisi platform.
                </p>
              </div>
            </div>

            {/* Create Settlement Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
              <h3 className="font-display font-bold text-sm text-slate-900">Buat Rekap Pencairan Dana Baru</h3>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <select
                  value={selectedSettlementMerchantId}
                  onChange={(e) => handleMerchantSelectForSettlement(e.target.value)}
                  className="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 font-medium sm:w-80"
                >
                  <option value="">-- Pilih Toko Merchant --</option>
                  {merchants.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.bankName || 'BCA'})</option>
                  ))}
                </select>

                {previewSettlement && (
                  <button
                    onClick={createSettlement}
                    disabled={previewSettlement.orderCount === 0}
                    className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    Generate Settlement (Rp {previewSettlement.netAmount.toLocaleString('id-ID')})
                  </button>
                )}
              </div>

              {previewSettlement && (
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3.5 text-xs text-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Pesanan Selesai</span>
                    <span className="font-bold text-slate-800 text-sm">{previewSettlement.orderCount} Transaksi</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Penjualan</span>
                    <span className="font-bold text-slate-800 text-sm">Rp {previewSettlement.totalSales.toLocaleString('id-ID')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Komisi Platform</span>
                    <span className="font-bold text-rose-700 text-sm">- Rp {previewSettlement.commission.toLocaleString('id-ID')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-700 uppercase font-bold block">Jumlah Ditransfer</span>
                    <span className="font-extrabold text-emerald-800 text-sm">Rp {previewSettlement.netAmount.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Settlements History Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-100">
                <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-700">Riwayat Rekap Settlement</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-3 px-4">Toko Merchant</th>
                      <th className="py-3 px-4">Rekening Tujuan</th>
                      <th className="py-3 px-4">Jumlah Transaksi</th>
                      <th className="py-3 px-4">Nominal Transfer</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {settlements.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Belum ada rekap pencairan dana yang dibuat.
                        </td>
                      </tr>
                    ) : (
                      settlements.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/60">
                          <td className="py-3.5 px-4 font-bold text-slate-800">{s.merchantName}</td>
                          <td className="py-3.5 px-4 font-mono">
                            {s.bankName} - {s.bankAccount} ({s.bankHolder})
                          </td>
                          <td className="py-3.5 px-4">{s.orderCount} Pesanan</td>
                          <td className="py-3.5 px-4 font-mono font-bold text-emerald-800">
                            Rp {s.amountToPay.toLocaleString('id-ID')}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                              s.status === SettlementStatus.SETTLEMENT_COMPLETED ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {s.status === SettlementStatus.SETTLEMENT_COMPLETED ? 'Telah Ditransfer' : 'Menunggu Transfer'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {s.status !== SettlementStatus.SETTLEMENT_COMPLETED && (
                              <button
                                onClick={() => completeSettlementTransfer(s.id)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                              >
                                Tandai Selesai Ditransfer
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 7. TAB: PENGATURAN SISTEM */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-6">
            <div>
              <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Pengaturan Biaya & Pembayaran Sistem</h2>
              <p className="text-xs text-slate-500 mt-0.5">Konfigurasi gambar QRIS pembayaran, ongkos kirim standar, dan biaya layanan.</p>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Gambar QRIS Platform (URL atau Gambar)
                </label>
                <input
                  type="text"
                  value={qrisInput}
                  onChange={(e) => setQrisInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  placeholder="https://... atau data:image/png;base64,..."
                />
                {qrisInput && (
                  <div className="mt-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
                    <img src={qrisInput} alt="Preview QRIS" className="w-16 h-16 object-contain rounded-lg border bg-white" />
                    <span className="text-xs text-slate-500">Pratinjau QRIS yang akan ditampilkan kepada pelanggan saat checkout.</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Ongkir Standar (Rp)
                  </label>
                  <input
                    type="number"
                    value={deliveryFeeInput}
                    onChange={(e) => setDeliveryFeeInput(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Biaya Layanan (Rp)
                  </label>
                  <input
                    type="number"
                    value={serviceFeeInput}
                    onChange={(e) => setServiceFeeInput(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Komisi Platform (%)
                  </label>
                  <input
                    type="number"
                    value={commissionPercentInput}
                    onChange={(e) => setCommissionPercentInput(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {savingConfig ? 'Menyimpan...' : 'Simpan Pengaturan'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 8. TAB: KELOLA REVIEW PENGGUNA (TESTIMONIALS & REVIEWS) */}
        {activeTab === 'testimonials' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div>
                <h2 className="font-display font-bold text-base sm:text-lg text-slate-900">Kelola Review Pengguna TumpangGo</h2>
                <p className="text-xs text-slate-500 mt-0.5 max-w-2xl leading-relaxed">
                  Kurasi, filter, dan moderasi ulasan nyata dari pemilik merchant dan pelanggan. Hanya ulasan berstatus <strong className="text-emerald-700 font-bold">Published</strong> dan memiliki persetujuan publikasi yang akan tampil di homepage.
                </p>
              </div>

              <button
                onClick={() => {
                  if (showAddTestiForm) {
                    setShowAddTestiForm(false);
                    setEditingTestiId(null);
                  } else {
                    setEditingTestiId(null);
                    setNewTestiName('');
                    setNewTestiRole('');
                    setNewTestiContent('');
                    setNewTestiRating(5);
                    setNewTestiOrder(1);
                    setNewTestiStatus('published');
                    setNewTestiConsent(true);
                    setShowAddTestiForm(true);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer self-start sm:self-auto active:scale-95"
              >
                <Quote className="w-3.5 h-3.5" />
                <span>{showAddTestiForm ? 'Tutup Formulir' : '+ Tambah Review'}</span>
              </button>
            </div>

            {/* Filter Kategori & Status Moderasi Review */}
            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-xs font-bold text-slate-600 mr-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span>Kategori:</span>
                </div>

                <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setAdminReviewCategoryFilter('all')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      adminReviewCategoryFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua ({testimonials.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminReviewCategoryFilter('merchant')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      adminReviewCategoryFilter === 'merchant'
                        ? 'bg-white text-emerald-800 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Store className="w-3 h-3" />
                    <span>Merchant ({testimonials.filter(t => t.category === 'merchant' || t.category === 'umkm').length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminReviewCategoryFilter('pelanggan')}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      adminReviewCategoryFilter === 'pelanggan'
                        ? 'bg-white text-blue-800 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users className="w-3 h-3" />
                    <span>Pelanggan ({testimonials.filter(t => t.category === 'pelanggan').length})</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Status:</span>
                <select
                  value={adminReviewStatusFilter}
                  onChange={(e) => setAdminReviewStatusFilter(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:border-emerald-600"
                >
                  <option value="all">Semua Status ({testimonials.length})</option>
                  <option value="published">Published ({testimonials.filter(t => t.status === 'published').length})</option>
                  <option value="pending">Menunggu Moderasi ({testimonials.filter(t => t.status === 'pending').length})</option>
                  <option value="rejected">Ditolak ({testimonials.filter(t => t.status === 'rejected').length})</option>
                  <option value="draft">Draft ({testimonials.filter(t => t.status === 'draft').length})</option>
                </select>
              </div>
            </div>

            {/* Add / Edit Review Form */}
            {showAddTestiForm && (
              <form onSubmit={handleSaveReview} className="bg-white p-4 sm:p-5 rounded-2xl border border-emerald-300 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-2">
                    <Quote className="w-4 h-4 text-emerald-600" />
                    <span>{editingTestiId ? 'Edit Review Pengguna' : 'Tambah Review Baru'}</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddTestiForm(false);
                      setEditingTestiId(null);
                    }}
                    className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Nama Pengguna *</label>
                    <input
                      type="text"
                      required
                      value={newTestiName}
                      onChange={(e) => setNewTestiName(e.target.value)}
                      placeholder="Contoh: Pak Slamet"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Kategori *</label>
                    <select
                      value={newTestiCategory}
                      onChange={(e) => setNewTestiCategory(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-semibold"
                    >
                      <option value="merchant">Review Merchant</option>
                      <option value="pelanggan">Review Pelanggan</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {newTestiCategory === 'merchant' ? 'Nama Usaha / Toko *' : 'Keterangan Warga (Opsional)'}
                    </label>
                    <input
                      type="text"
                      value={newTestiCategory === 'merchant' ? newTestiMerchantName : newTestiRole}
                      onChange={(e) => {
                        if (newTestiCategory === 'merchant') {
                          setNewTestiMerchantName(e.target.value);
                          setNewTestiRole(e.target.value ? `Pemilik ${e.target.value}` : '');
                        } else {
                          setNewTestiRole(e.target.value);
                        }
                      }}
                      placeholder={newTestiCategory === 'merchant' ? 'Contoh: Warung Bakso Barokah' : 'Contoh: Warga Tumpang Krajan'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Judul Review (Opsional)</label>
                    <input
                      type="text"
                      value={newTestiTitle}
                      onChange={(e) => setNewTestiTitle(e.target.value)}
                      placeholder="Contoh: Sangat Membantu Usaha Kuliner Saya"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Peran Detail Tambahan (Opsional)</label>
                    <input
                      type="text"
                      value={newTestiRole}
                      onChange={(e) => setNewTestiRole(e.target.value)}
                      placeholder="Contoh: Pemilik Warung Sejak 2020"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Rating Kepuasan (1 - 5 Bintang)</label>
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-2">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setNewTestiRating(s)}
                          className="p-1 cursor-pointer hover:scale-110 transition-transform"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              s <= newTestiRating ? 'text-amber-500 fill-amber-400' : 'text-slate-300'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="text-xs font-bold text-slate-700 ml-2">
                        {newTestiRating} / 5 Bintang
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Status Moderasi *</label>
                    <select
                      value={newTestiStatus}
                      onChange={(e) => setNewTestiStatus(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 font-semibold"
                    >
                      <option value="published">Published (Tampil di Homepage)</option>
                      <option value="pending">Pending (Menunggu Moderasi)</option>
                      <option value="rejected">Rejected (Ditolak)</option>
                      <option value="draft">Draft (Disimpan Internal)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Isi Review / Pengalaman *</label>
                  <textarea
                    required
                    rows={3}
                    maxLength={350}
                    value={newTestiContent}
                    onChange={(e) => setNewTestiContent(e.target.value)}
                    placeholder="Tuliskan pengalaman nyata pengguna..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-emerald-500 resize-none"
                  />
                  <span className="text-[10px] text-slate-400 block text-right">
                    {newTestiContent.length}/350 karakter
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={newTestiConsent}
                      onChange={(e) => setNewTestiConsent(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Persetujuan Publikasi Terverifikasi (Wajib untuk Tampil di Homepage)</span>
                  </label>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddTestiForm(false);
                        setEditingTestiId(null);
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={savingTesti}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs active:scale-95"
                    >
                      {savingTesti ? 'Menyimpan...' : (editingTestiId ? 'Simpan Perubahan' : 'Simpan Review')}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Daftar Review dengan Filter Aktif */}
            {(() => {
              const filteredList = testimonials.filter(t => {
                const normCat = (t.category === 'merchant' || t.category === 'umkm') ? 'merchant' : 'pelanggan';
                if (adminReviewCategoryFilter !== 'all' && normCat !== adminReviewCategoryFilter) return false;
                if (adminReviewStatusFilter !== 'all' && t.status !== adminReviewStatusFilter) return false;
                return true;
              });

              if (filteredList.length === 0) {
                return (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <Quote className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-slate-700">Tidak ada data review pada filter ini.</span>
                    <span className="text-slate-400 max-w-sm">
                      {testimonials.length === 0
                        ? 'Belum ada review pengguna di database. Klik tombol "+ Tambah Review" untuk memasukkan ulasan nyata yang telah diverifikasi.'
                        : 'Coba ubah filter kategori atau status moderasi untuk melihat data review lainnya.'}
                    </span>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredList.map((testi) => {
                    const isMerchant = (testi.category === 'merchant' || testi.category === 'umkm');

                    return (
                      <div key={testi.id} className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-3">
                        <div>
                          {/* Header: Kategori, Rating, dan Status Moderasi */}
                          <div className="flex items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                isMerchant
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200/60'
                                  : 'bg-blue-100 text-blue-800 border border-blue-200/60'
                              }`}>
                                {isMerchant ? 'Review Merchant' : 'Review Pelanggan'}
                              </span>

                              {testi.rating && (
                                <div className="flex items-center gap-0.5 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-700">
                                  <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
                                  <span>{testi.rating}.0</span>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                testi.status === 'published'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : testi.status === 'rejected'
                                  ? 'bg-red-100 text-red-700'
                                  : testi.status === 'pending'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {testi.status === 'published' ? 'Published' : (testi.status === 'rejected' ? 'Ditolak' : (testi.status === 'pending' ? 'Pending' : 'Draft'))}
                              </span>

                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                testi.consentApproved
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-red-50 text-red-600'
                              }`}>
                                {testi.consentApproved ? 'Izin OK' : 'Belum Ada Izin'}
                              </span>
                            </div>
                          </div>

                          {/* Judul & Isi Review */}
                          {testi.title && (
                            <h4 className="font-bold text-xs text-slate-900 mb-1">
                              {testi.title}
                            </h4>
                          )}
                          <p className="text-xs sm:text-[13px] text-slate-700 italic leading-relaxed mb-2">
                            "{testi.content}"
                          </p>
                        </div>

                        {/* Footer: Informasi Pengguna dan Tombol Aksi Moderasi */}
                        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div>
                            <span className="font-extrabold text-xs text-slate-900 block">{testi.userName}</span>
                            <span className="text-[10px] text-slate-500">
                              {testi.merchantName ? `Toko: ${testi.merchantName}` : (testi.roleDetail || (isMerchant ? 'Pemilik Usaha' : 'Pelanggan Tumpang'))}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-auto">
                            {/* Moderasi Aksi */}
                            {testi.status !== 'published' ? (
                              <button
                                onClick={() => handleUpdateReviewStatus(testi.id, 'published')}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-700 hover:bg-emerald-800 text-white transition-all cursor-pointer shadow-2xs"
                                title="Terbitkan ke homepage"
                              >
                                Terbitkan
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUpdateReviewStatus(testi.id, 'pending')}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-800 transition-all cursor-pointer"
                                title="Kembalikan status menjadi pending"
                              >
                                Pendingkan
                              </button>
                            )}

                            {testi.status !== 'rejected' && (
                              <button
                                onClick={() => handleUpdateReviewStatus(testi.id, 'rejected')}
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 transition-colors cursor-pointer"
                                title="Tolak review ini"
                              >
                                Tolak
                              </button>
                            )}

                            <button
                              onClick={() => handleStartEditReview(testi)}
                              className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                              title="Edit review"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => handleDeleteTestimonial(testi.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Hapus permanen"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* Admin Footer & Copyright (Independent secret trigger) */}
        <footer className="mt-12 pt-6 pb-8 border-t border-slate-200/80 px-4 flex flex-col items-center justify-center text-center">
          <p 
            onClick={handleCopyrightClick}
            className="text-[11px] text-slate-400 font-normal select-none cursor-default"
          >
            © 2026 TumpangGo. All rights reserved.
          </p>

          {isUnlocked && (
            <HiddenPortalBar 
              currentPortal="ADMIN"
              onNavigatePortal={(portal) => {
                if (onSelectRole) onSelectRole(portal);
              }}
              onLogout={onLogout}
              variant="light"
            />
          )}
        </footer>

      </main>

      {/* Reject Payment Modal */}
      {paymentRejectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3">
            <h3 className="font-display font-bold text-sm text-slate-900">Tolak Bukti Pembayaran</h3>
            <p className="text-xs text-slate-500">Berikan alasan jelas agar pelanggan dapat memperbaiki atau mengunggah ulang bukti bayar.</p>
            <textarea
              value={paymentRejectModal.reason}
              onChange={(e) => setPaymentRejectModal({ ...paymentRejectModal, reason: e.target.value })}
              placeholder="Contoh: Nominal transfer kurang, bukti kabur, atau dana belum masuk..."
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-rose-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setPaymentRejectModal(null)}
                className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                Batal
              </button>
              <button
                onClick={() => rejectPayment(paymentRejectModal.orderId, paymentRejectModal.reason)}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Tolak Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Driver Modal */}
      {assignDriverModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3">
            <h3 className="font-display font-bold text-sm text-slate-900">Tugaskan Kurir / Driver</h3>
            <p className="text-xs text-slate-500">Pilih mitra driver yang tersedia untuk mengantar pesanan ini.</p>
            <select
              value={assignDriverModal.selectedDriverId}
              onChange={(e) => setAssignDriverModal({ ...assignDriverModal, selectedDriverId: e.target.value })}
              className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-emerald-500"
            >
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.online ? 'Online' : 'Offline'}) - {d.phone}</option>
              ))}
            </select>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setAssignDriverModal(null)}
                className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                Batal
              </button>
              <button
                onClick={() => assignDriver(assignDriverModal.orderId, assignDriverModal.selectedDriverId)}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                Tugaskan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Preview Modal */}
      {showImageModal && (
        <div 
          onClick={() => setShowImageModal(null)}
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-lg w-full bg-white rounded-2xl p-2 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowImageModal(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-slate-900/80 text-white flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <img src={showImageModal} alt="Preview Bukti" className="w-full max-h-[80vh] object-contain rounded-xl" />
          </div>
        </div>
      )}

      {/* Admin Merchant QRIS Management Modal */}
      {adminQrisModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm text-slate-900">Kelola QRIS Statis Merchant</h3>
                  <p className="text-[11px] text-slate-500">{adminQrisModal.merchant.name} ({adminQrisModal.merchant.ownerName})</p>
                </div>
              </div>
              <button 
                onClick={() => { setAdminQrisModal(null); setAdminQrisFile(null); setAdminQrisMsg(null); }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {adminQrisMsg && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                adminQrisMsg.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {adminQrisMsg.type === 'success' ? <Check className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />}
                <span>{adminQrisMsg.text}</span>
              </div>
            )}

            {/* Current QRIS Display */}
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                QRIS Saat Ini di Toko:
              </span>
              {adminQrisModal.merchant.qrisImage ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div 
                      onClick={() => setShowImageModal(adminQrisModal.merchant.qrisImage)}
                      className="w-16 h-16 rounded-lg bg-white border border-slate-200 p-1 overflow-hidden shrink-0 cursor-pointer shadow-2xs group relative"
                    >
                      <img 
                        src={adminQrisModal.merchant.qrisImage} 
                        alt="QRIS Merchant" 
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-emerald-700 block">QRIS Aktif Terpasang</span>
                      <span className="text-[10px] text-slate-400">Klik gambar untuk melihat ukuran penuh</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAdminDeleteMerchantQris(adminQrisModal.merchant.id)}
                    disabled={savingAdminQris}
                    className="py-1.5 px-3 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center text-xs text-amber-800">
                  Toko ini belum memiliki QRIS statis terpasang. Pelanggan tidak dapat membayar dengan QRIS untuk toko ini sampai QRIS diunggah.
                </div>
              )}
            </div>

            {/* Upload New / Replace Form */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {adminQrisModal.merchant.qrisImage ? 'Ganti dengan QRIS Baru:' : 'Unggah QRIS Baru:'}
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  onChange={handleAdminQrisFileChange}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Format: JPG, PNG, WebP (maks. 5MB)</span>
              </div>

              {adminQrisFile && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider self-start">Pratinjau QRIS Baru:</span>
                  <div className="w-40 h-40 bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
                    <img src={adminQrisFile} alt="Preview Baru" className="w-full h-full object-contain" />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setAdminQrisModal(null); setAdminQrisFile(null); setAdminQrisMsg(null); }}
                  className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => handleAdminSaveMerchantQris(adminQrisModal.merchant.id)}
                  disabled={!adminQrisFile || savingAdminQris}
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  {savingAdminQris ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>{savingAdminQris ? 'Menyimpan...' : 'Simpan QRIS'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedReceiptOrder && (
        <EReceiptModal 
          order={selectedReceiptOrder} 
          onClose={() => setSelectedReceiptOrder(null)} 
        />
      )}
    </div>
  );
}
