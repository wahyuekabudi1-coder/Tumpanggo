/**
 * Types and interfaces for Tumpang Food
 */

export enum OrderStatus {
  WAITING_PAYMENT = 'WAITING_PAYMENT',
  WAITING_PAYMENT_VERIFICATION = 'WAITING_PAYMENT_VERIFICATION',
  PAYMENT_VERIFIED = 'PAYMENT_VERIFIED',
  COOKING = 'COOKING',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  ORDER_PICKED_UP = 'ORDER_PICKED_UP',
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  PAYMENT_REJECTED = 'PAYMENT_REJECTED'
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  WAITING_VERIFICATION = 'WAITING_VERIFICATION',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  REFUNDED = 'REFUNDED'
}

export enum SettlementStatus {
  WAITING_CONFIRMATION = 'WAITING_CONFIRMATION',
  SETTLEMENT_COMPLETED = 'SETTLEMENT_COMPLETED'
}

export enum AssignmentMode {
  MANUAL = 'MANUAL',
  AUTOMATIC = 'AUTOMATIC'
}

export interface Merchant {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  openTime: string; // e.g. "08:00"
  closeTime: string; // e.g. "21:00"
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  active: boolean;
  rating: number;
  cookTimeEstimate: string; // e.g. "15-30 min"
  image: string;
  bannerImage?: string;
  description: string;
  category?: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
  
  // Merchant Static QRIS for payments
  qrisImage?: string;
  qrisUpdatedAt?: string;

  // Activation and Authentication
  isActivated?: boolean;
  password?: string;
  businessPhoto?: string;
  idPhoto?: string;
  contractPhoto?: string;
}

export interface Category {
  id: string;
  merchantId: string;
  name: string;
  orderIndex: number;
}

export interface MenuItem {
  id: string;
  merchantId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
  image: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

export interface Order {
  id: string;
  orderNumber?: string; // Canonical public order number e.g. "TF-20261021-001" or "TF-ZSXU9O4"
  uniqueCode: number; // 3 digit (e.g. 1 to 99, randomized and padded)
  customerName: string;
  customerPhone: string;
  customerPhoneMasked?: string;
  deliveryAddress: string;
  deliveryDetails: string;
  landmark: string;
  latitude: number;
  longitude: number;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number; // subtotal + deliveryFee + serviceFee + uniqueCode/1000 or similar, let's add uniqueCode as integer to total
  paymentProof?: string; // Cloudinary or base64 URL
  paymentProofUrl?: string; // Backend streaming URL (/api/orders/:id/payment-proof)
  paymentProofUploadedAt?: string;
  paymentRejectionReason?: string;
  paymentVerifiedBy?: string;
  paymentVerifiedAt?: string;
  deliveryProof?: string; // Cloudinary or base64 URL
  merchantId: string;
  merchantName: string;
  driverId?: string;
  driverName?: string;
  cookingTimeMinutes?: number; // 15, 30, 45, 60
  cookingDurationMinutes?: number; // 15, 30, 45, 60
  cookingStartedAt?: string; // ISO UTC timestamp
  cookingEndsAt?: string; // ISO UTC timestamp
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
  paymentExpiresAt: string; // ISO string (createdAt + 10 mins)
  preOrderDate?: string; // e.g. "2026-07-03" (YYYY-MM-DD) - Retained strictly for reading historical transactions
  clientRequestId?: string;
  paymentMethod?: 'MERCHANT_QRIS' | 'MANUAL_TRANSFER' | 'ARTOPAY_QRIS';
  merchantQrisImage?: string;
  receiptNumber?: string;
  receipt?: OrderReceipt;
  artopayPaymentId?: string;
  artopayCheckoutUrl?: string;
  artopayStatus?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  artopayExpiredAt?: string;
  artopayQrString?: string;
  artopayClientSecret?: string;
  artopayCustomerToken?: string;
  artopayPublicKey?: string;
  artopayOrderId?: string;
  artopaySandbox?: boolean;
}

export interface OrderReceipt {
  receiptNumber: string;
  orderId: string;
  orderNumber?: string;
  issuedAt: string;
  confirmedBy: string;
  paymentMethod: string;
  transactionRef: string;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  uniqueCode: number;
  total: number;
  customerName: string;
  merchantName: string;
  status: 'PAID';
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email?: string;
  active: boolean;
  online: boolean;
  latitude?: number;
  longitude?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Settlement {
  id: string;
  merchantId: string;
  merchantName: string;
  orderCount: number;
  totalSales: number;
  totalCommission: number;
  amountToPay: number;
  status: SettlementStatus;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  createdAt: string;
  paidAt?: string;
}

export enum Role {
  CUSTOMER = 'CUSTOMER',
  MERCHANT = 'MERCHANT',
  DRIVER = 'DRIVER',
  ADMIN = 'ADMIN',
  SHOP_ADMIN = 'SHOP_ADMIN',
  MASTER_ADMIN = 'MASTER_ADMIN'
}

export type AppRole = 'ADMIN' | 'MERCHANT' | 'DRIVER' | 'SYSTEM' | 'CUSTOMER' | 'SHOP_ADMIN' | 'MASTER_ADMIN';

export interface AuditLog {
  id: string;
  action: string;
  userId: string; // Can be admin id, merchant id, or driver id
  role: AppRole;
  details: string;
  createdAt: string;
}

export interface SystemConfig {
  id?: string;
  serviceFee: number;
  deliveryFeePerKm?: number;
  defaultDeliveryFee: number;
  commissionPercent?: number; // e.g. 10 for 10%
  assignmentMode?: AssignmentMode;
  qrisImage: string;
  systemOpen?: boolean;
  masterAccount?: {
    email: string;
    passwordHash: string;
    updatedAt: string;
  };
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MASTER_ADMIN';
  password?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerRegistration {
  id: string;
  name: string;
  phone: string;
  email?: string;
  type: 'MERCHANT' | 'DRIVER';
  // merchant options
  storeName?: string;
  storeAddress?: string;
  category?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  description?: string;
  // driver options
  vehicleType?: string;
  vehicleNumber?: string;
  operatingArea?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVATED';
  createdAt: string;
  businessPhoto?: string;
  idPhoto?: string;
  contractPhoto?: string;
  latitude?: number;
  longitude?: number;
  password?: string;
  storeId?: string;
  contractVersion?: string;
  contractAgreedAt?: string;
}

export type ReviewCategory = 'merchant' | 'pelanggan' | 'umkm';
export type ReviewStatus = 'draft' | 'pending' | 'published' | 'rejected';

export interface Testimonial {
  id: string;
  userName: string;
  merchantName?: string; // Nama usaha/toko khusus kategori merchant
  category: ReviewCategory;
  title?: string; // Judul ulasan (opsional)
  content: string;
  avatarUrl?: string;
  roleDetail?: string; // e.g. "Pemilik Warung Bakso Barokah" atau "Pelanggan Setia Tumpang"
  rating?: number; // 1 - 5 stars jika rating tersedia secara nyata
  consentApproved: boolean; // status verifikasi persetujuan publikasi
  status: ReviewStatus;
  displayOrder: number;
  createdAt: string;
  updatedAt?: string;
}

// Alias for UserReview
export type UserReview = Testimonial;

/**
 * Menghitung biaya layanan pelanggan bertingkat berdasarkan nominal subtotal makanan.
 * Ketentuan tarif resmi TumpangGo:
 * - Rp 0 – Rp 30.000       : Rp 1.200
 * - Rp 30.001 – Rp 99.000  : Rp 2.000
 * - Rp 100.000 – Rp 199.000: Rp 3.000
 * - Rp 200.000 – Rp 299.000: Rp 4.000
 * - Rp 300.000 – Rp 500.000: Rp 5.000
 * Aturan bisnis berkelanjutan:
 * - Rp 500.001 – Rp 700.000: Rp 5.000
 * - Di atas Rp 700.000     : Rp 10.000
 */
export function calculateTieredServiceFee(subtotal: number): number {
  const amount = Math.max(0, Math.round(Number(subtotal) || 0));
  if (amount <= 30000) return 1200;
  if (amount < 100000) return 2000;
  if (amount < 200000) return 3000;
  if (amount < 300000) return 4000;
  if (amount <= 700000) return 5000;
  return 10000;
}

// Re-export isolated Tumpang Shop types
export * from './types/shop';

