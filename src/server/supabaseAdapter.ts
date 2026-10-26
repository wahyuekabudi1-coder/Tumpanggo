/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Supabase PostgreSQL Adapter
 * Enterprise-grade client adapter providing full compatibility with the existing foodDb interface.
 * Implements granular table queries, strict parameter filtering, and zero whole-table scans.
 */

import dns from 'dns';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { foodConfig } from './config';

// Prioritize IPv4 DNS lookups on Node.js 18+ to eliminate serverless IPv6 connection timeout / fetch failed
try {
  if (typeof (dns as any).setDefaultResultOrder === 'function') {
    (dns as any).setDefaultResultOrder('ipv4first');
  }
} catch {}
import {
  Merchant, Category, MenuItem, Order, Driver, Settlement, AuditLog, SystemConfig,
  PartnerRegistration, Testimonial
} from '../types';

let supabaseClient: SupabaseClient | null = null;

export interface SupabaseTestMockState {
  isConfigured?: boolean;
  client?: any;
  upsertSuccess?: boolean;
  upsertError?: string;
  deleteSuccess?: boolean;
  deleteError?: string;
  probeResult?: { connected: boolean; url: string; latencyMs?: number; error?: string };
  fetchResult?: any[];
  onUpsert?: (collection: string, id: string, data: any) => void;
  onDelete?: (collection: string, id: string) => void;
}

let testSupabaseMock: SupabaseTestMockState | null = null;

export function __setSupabaseMockForTesting(mock: SupabaseTestMockState | null): void {
  testSupabaseMock = mock;
}

export function isSupabaseConfigured(): boolean {
  if (testSupabaseMock && testSupabaseMock.isConfigured !== undefined) {
    return testSupabaseMock.isConfigured;
  }
  return foodConfig.supabase.isConfigured;
}

let currentClientUrl = '';
let currentClientKey = '';

export function resetSupabaseClient(): void {
  supabaseClient = null;
  currentClientUrl = '';
  currentClientKey = '';
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!foodConfig.supabase.isConfigured) {
    return null;
  }
  const url = foodConfig.supabase.url;
  const key = foodConfig.supabase.serviceRoleKey || foodConfig.supabase.anonKey;

  if (!supabaseClient || currentClientUrl !== url || currentClientKey !== key) {
    currentClientUrl = url;
    currentClientKey = key;
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          'x-application-name': 'tumpanggo-serverless',
          'Connection': 'close'
        },
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          let retries = 2;
          let delay = 350;
          while (true) {
            try {
              return await fetch(input, init);
            } catch (err: any) {
              if (init?.signal?.aborted || err?.name === 'AbortError' || retries <= 0) {
                throw err;
              }
              retries--;
              await new Promise(r => setTimeout(r, delay));
              delay *= 2;
            }
          }
        }
      }
    });
  }
  return supabaseClient;
}

// -----------------------------------------------------------------------------
// Data Mapping: CamelCase (TypeScript/Frontend) <-> SnakeCase (PostgreSQL)
// -----------------------------------------------------------------------------

export function mapMerchantFromDb(row: any): Merchant {
  return {
    id: row.id,
    name: row.name,
    ownerName: row.owner_name || '',
    phone: row.phone || '',
    email: row.email || '',
    password: row.password_hash || '',
    address: row.address || '',
    latitude: Number(row.latitude) || -7.9942,
    longitude: Number(row.longitude) || 112.7667,
    openTime: row.open_time || '08:00',
    closeTime: row.close_time || '21:00',
    bankName: row.bank_name || '',
    bankAccount: row.bank_account || '',
    bankHolder: row.bank_holder || '',
    active: Boolean(row.active),
    rating: Number(row.rating) || 5.0,
    cookTimeEstimate: row.cook_time_estimate || '15-30 min',
    image: row.image || '',
    businessPhoto: row.business_photo || row.image || '',
    description: row.description || '',
    category: row.category || 'Nasi & Lauk',
    qrisImage: row.qris_image || '',
    qrisUpdatedAt: row.qris_updated_at || undefined,
    isActivated: Boolean(row.is_activated),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export function mapMerchantToDb(m: Partial<Merchant>): Record<string, any> {
  const row: Record<string, any> = {};
  if (m.id !== undefined) row.id = m.id;
  if (m.name !== undefined) row.name = m.name;
  if (m.ownerName !== undefined) row.owner_name = m.ownerName;
  if (m.phone !== undefined) row.phone = m.phone;
  if (m.email !== undefined) row.email = m.email;
  if (m.password !== undefined) row.password_hash = m.password;
  if (m.address !== undefined) row.address = m.address;
  if (m.latitude !== undefined) row.latitude = m.latitude;
  if (m.longitude !== undefined) row.longitude = m.longitude;
  if (m.openTime !== undefined) row.open_time = m.openTime;
  if (m.closeTime !== undefined) row.close_time = m.closeTime;
  if (m.bankName !== undefined) row.bank_name = m.bankName;
  if (m.bankAccount !== undefined) row.bank_account = m.bankAccount;
  if (m.bankHolder !== undefined) row.bank_holder = m.bankHolder;
  if (m.active !== undefined) row.active = m.active;
  if (m.rating !== undefined) row.rating = m.rating;
  if (m.cookTimeEstimate !== undefined) row.cook_time_estimate = m.cookTimeEstimate;
  if (m.image !== undefined) row.image = m.image;
  if (m.businessPhoto !== undefined) row.business_photo = m.businessPhoto;
  if (m.description !== undefined) row.description = m.description;
  if (m.category !== undefined) row.category = m.category;
  if (m.qrisImage !== undefined) row.qris_image = m.qrisImage;
  if (m.qrisUpdatedAt !== undefined) row.qris_updated_at = m.qrisUpdatedAt;
  if (m.isActivated !== undefined) row.is_activated = m.isActivated;
  if (m.createdAt !== undefined) row.created_at = m.createdAt;
  if (m.updatedAt !== undefined) row.updated_at = m.updatedAt;
  return row;
}

export function mapOrderFromDb(row: any): Order {
  const order: Order = {
    id: row.id,
    uniqueCode: Number(row.unique_code) || 0,
    total: Number(row.total) || 0,
    status: row.status,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name || '',
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    deliveryAddress: row.delivery_address || '',
    deliveryDetails: row.delivery_details || '',
    landmark: row.landmark || '',
    latitude: Number(row.latitude) || -7.9942,
    longitude: Number(row.longitude) || 112.7667,
    subtotal: Number(row.subtotal) || 0,
    deliveryFee: Number(row.delivery_fee) || 5000,
    serviceFee: Number(row.service_fee) || 2000,
    driverId: row.driver_id || undefined,
    driverName: row.driver_name || undefined,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    paymentProof: row.payment_proof || undefined,
    paymentProofUploadedAt: row.payment_proof_uploaded_at || undefined,
    paymentRejectionReason: row.payment_rejection_reason || undefined,
    paymentVerifiedBy: row.payment_verified_by || undefined,
    paymentVerifiedAt: row.payment_verified_at || undefined,
    deliveryProof: row.delivery_proof || undefined,
    preOrderDate: row.pre_order_date || undefined,
    paymentExpiresAt: row.payment_expires_at || undefined,
    items: Array.isArray(row.items) ? row.items : (typeof row.items === 'string' ? JSON.parse(row.items) : []),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
  if (row.is_settled !== undefined) {
    (order as any).isSettled = Boolean(row.is_settled);
  }
  return order;
}

export function mapOrderToDb(o: Partial<Order>): Record<string, any> {
  const row: Record<string, any> = {};
  if (o.id !== undefined) row.id = o.id;
  if (o.uniqueCode !== undefined) row.unique_code = o.uniqueCode;
  if (o.total !== undefined) row.total = o.total;
  if (o.status !== undefined) row.status = o.status;
  if (o.merchantId !== undefined) row.merchant_id = o.merchantId;
  if (o.merchantName !== undefined) row.merchant_name = o.merchantName;
  if (o.customerName !== undefined) row.customer_name = o.customerName;
  if (o.customerPhone !== undefined) row.customer_phone = o.customerPhone;
  if (o.deliveryAddress !== undefined) row.delivery_address = o.deliveryAddress;
  if (o.deliveryDetails !== undefined) row.delivery_details = o.deliveryDetails;
  if (o.landmark !== undefined) row.landmark = o.landmark;
  if (o.latitude !== undefined) row.latitude = o.latitude;
  if (o.longitude !== undefined) row.longitude = o.longitude;
  if (o.subtotal !== undefined) row.subtotal = o.subtotal;
  if (o.deliveryFee !== undefined) row.delivery_fee = o.deliveryFee;
  if (o.serviceFee !== undefined) row.service_fee = o.serviceFee;
  if (o.driverId !== undefined) row.driver_id = o.driverId || null;
  if (o.driverName !== undefined) row.driver_name = o.driverName;
  if (o.paymentStatus !== undefined) row.payment_status = o.paymentStatus;
  if (o.paymentMethod !== undefined) row.payment_method = o.paymentMethod;
  if (o.paymentProof !== undefined) row.payment_proof = o.paymentProof;
  if (o.paymentProofUploadedAt !== undefined) row.payment_proof_uploaded_at = o.paymentProofUploadedAt;
  if (o.paymentRejectionReason !== undefined) row.payment_rejection_reason = o.paymentRejectionReason;
  if (o.paymentVerifiedBy !== undefined) row.payment_verified_by = o.paymentVerifiedBy;
  if (o.paymentVerifiedAt !== undefined) row.payment_verified_at = o.paymentVerifiedAt;
  if (o.deliveryProof !== undefined) row.delivery_proof = o.deliveryProof;
  if ((o as any).isSettled !== undefined) row.is_settled = (o as any).isSettled;
  if (o.preOrderDate !== undefined) row.pre_order_date = o.preOrderDate;
  if (o.paymentExpiresAt !== undefined) row.payment_expires_at = o.paymentExpiresAt;
  if (o.items !== undefined) row.items = o.items;
  if (o.createdAt !== undefined) row.created_at = o.createdAt;
  if (o.updatedAt !== undefined) row.updated_at = o.updatedAt;
  return row;
}

export function mapMenuItemFromDb(row: any): MenuItem {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description || '',
    price: Number(row.price) || 0,
    available: Boolean(row.available),
    image: row.image || '',
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export function mapMenuItemToDb(item: Partial<MenuItem>): Record<string, any> {
  const row: Record<string, any> = {};
  if (item.id !== undefined) row.id = item.id;
  if (item.merchantId !== undefined) row.merchant_id = item.merchantId;
  if (item.categoryId !== undefined) row.category_id = item.categoryId;
  if (item.name !== undefined) row.name = item.name;
  if (item.description !== undefined) row.description = item.description;
  if (item.price !== undefined) row.price = item.price;
  if (item.available !== undefined) row.available = item.available;
  if (item.image !== undefined) row.image = item.image;
  if (item.createdAt !== undefined) row.created_at = item.createdAt;
  if (item.updatedAt !== undefined) row.updated_at = item.updatedAt;
  return row;
}

export function mapCategoryFromDb(row: any): Category {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    name: row.name,
    orderIndex: Number(row.order_index) || 0
  };
}

export function mapCategoryToDb(cat: Partial<Category>): Record<string, any> {
  const row: Record<string, any> = {};
  if (cat.id !== undefined) row.id = cat.id;
  if (cat.merchantId !== undefined) row.merchant_id = cat.merchantId;
  if (cat.name !== undefined) row.name = cat.name;
  if (cat.orderIndex !== undefined) row.order_index = cat.orderIndex;
  return row;
}

export function mapDriverFromDb(row: any): Driver {
  const driver: Driver = {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    email: row.email || '',
    active: Boolean(row.active),
    online: Boolean(row.online),
    latitude: Number(row.latitude) || -7.9942,
    longitude: Number(row.longitude) || 112.7667,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
  if (row.password_hash) {
    (driver as any).password = row.password_hash;
  }
  return driver;
}

export function mapDriverToDb(d: Partial<Driver>): Record<string, any> {
  const row: Record<string, any> = {};
  if (d.id !== undefined) row.id = d.id;
  if (d.name !== undefined) row.name = d.name;
  if (d.phone !== undefined) row.phone = d.phone;
  if (d.email !== undefined) row.email = d.email;
  if ((d as any).password !== undefined) row.password_hash = (d as any).password;
  if (d.active !== undefined) row.active = d.active;
  if (d.online !== undefined) row.online = d.online;
  if (d.latitude !== undefined) row.latitude = d.latitude;
  if (d.longitude !== undefined) row.longitude = d.longitude;
  if (d.createdAt !== undefined) row.created_at = d.createdAt;
  if (d.updatedAt !== undefined) row.updated_at = d.updatedAt;
  return row;
}

export function mapSettlementFromDb(row: any): Settlement {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name || '',
    orderCount: Number(row.order_count) || 0,
    totalSales: Number(row.total_sales) || 0,
    totalCommission: Number(row.total_commission) || 0,
    amountToPay: Number(row.amount_to_pay) || 0,
    status: row.status,
    bankName: row.bank_name || '',
    bankAccount: row.bank_account || '',
    bankHolder: row.bank_holder || '',
    paidAt: row.paid_at || undefined,
    createdAt: row.created_at || new Date().toISOString()
  };
}

export function mapSettlementToDb(s: Partial<Settlement>): Record<string, any> {
  const row: Record<string, any> = {};
  if (s.id !== undefined) row.id = s.id;
  if (s.merchantId !== undefined) row.merchant_id = s.merchantId;
  if (s.merchantName !== undefined) row.merchant_name = s.merchantName;
  if (s.orderCount !== undefined) row.order_count = s.orderCount;
  if (s.totalSales !== undefined) row.total_sales = s.totalSales;
  if (s.totalCommission !== undefined) row.total_commission = s.totalCommission;
  if (s.amountToPay !== undefined) row.amount_to_pay = s.amountToPay;
  if (s.status !== undefined) row.status = s.status;
  if (s.bankName !== undefined) row.bank_name = s.bankName;
  if (s.bankAccount !== undefined) row.bank_account = s.bankAccount;
  if (s.bankHolder !== undefined) row.bank_holder = s.bankHolder;
  if (s.paidAt !== undefined) row.paid_at = s.paidAt;
  if (s.createdAt !== undefined) row.created_at = s.createdAt;
  return row;
}

export function mapTestimonialFromDb(row: any): Testimonial {
  return {
    id: row.id,
    userName: row.user_name,
    merchantName: row.merchant_name || '',
    category: row.category,
    title: row.title || '',
    content: row.content,
    avatarUrl: row.avatar_url || '',
    roleDetail: row.role_detail || '',
    rating: Number(row.rating) || 5,
    consentApproved: Boolean(row.consent_approved),
    status: row.status,
    displayOrder: Number(row.display_order) || 0,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export function mapTestimonialToDb(t: Partial<Testimonial>): Record<string, any> {
  const row: Record<string, any> = {};
  if (t.id !== undefined) row.id = t.id;
  if (t.userName !== undefined) row.user_name = t.userName;
  if (t.merchantName !== undefined) row.merchant_name = t.merchantName;
  if (t.category !== undefined) row.category = t.category;
  if (t.title !== undefined) row.title = t.title;
  if (t.content !== undefined) row.content = t.content;
  if (t.avatarUrl !== undefined) row.avatar_url = t.avatarUrl;
  if (t.roleDetail !== undefined) row.role_detail = t.roleDetail;
  if (t.rating !== undefined) row.rating = t.rating;
  if (t.consentApproved !== undefined) row.consent_approved = t.consentApproved;
  if (t.status !== undefined) row.status = t.status;
  if (t.displayOrder !== undefined) row.display_order = t.displayOrder;
  if (t.createdAt !== undefined) row.created_at = t.createdAt;
  if (t.updatedAt !== undefined) row.updated_at = t.updatedAt;
  return row;
}

export function mapPartnerRegFromDb(row: any): PartnerRegistration {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    storeName: row.store_name || '',
    phone: row.phone,
    email: row.email || '',
    storeAddress: row.address || '',
    status: row.status,
    description: row.notes || '',
    createdAt: row.created_at || new Date().toISOString()
  };
}

export function mapPartnerRegToDb(r: Partial<PartnerRegistration>): Record<string, any> {
  const row: Record<string, any> = {};
  if (r.id !== undefined) row.id = r.id;
  if (r.type !== undefined) row.type = r.type;
  if (r.name !== undefined) row.name = r.name;
  if (r.storeName !== undefined) row.store_name = r.storeName;
  if (r.phone !== undefined) row.phone = r.phone;
  if (r.email !== undefined) row.email = r.email;
  if ((r as any).address !== undefined || r.storeAddress !== undefined) {
    row.address = (r as any).address || r.storeAddress;
  }
  if (r.status !== undefined) row.status = r.status;
  if ((r as any).notes !== undefined || r.description !== undefined) {
    row.notes = (r as any).notes || r.description;
  }
  if (r.createdAt !== undefined) row.created_at = r.createdAt;
  row.updated_at = (r as any).updatedAt || new Date().toISOString();
  return row;
}

export function mapSystemConfigFromDb(row: any): SystemConfig {
  return {
    id: row.id || 'config_1',
    serviceFee: Number(row.service_fee) || 2000,
    deliveryFeePerKm: Number(row.delivery_fee_per_km) || 2000,
    defaultDeliveryFee: Number(row.default_delivery_fee) || 5000,
    commissionPercent: Number(row.commission_percent) || 10,
    assignmentMode: row.assignment_mode || 'MANUAL',
    qrisImage: row.qris_image || '/qris-merchant.png',
    systemOpen: row.system_open !== false
  };
}

export function mapSystemConfigToDb(c: Partial<SystemConfig>): Record<string, any> {
  const row: Record<string, any> = {};
  if (c.id !== undefined) row.id = c.id;
  if (c.serviceFee !== undefined) row.service_fee = c.serviceFee;
  if (c.deliveryFeePerKm !== undefined) row.delivery_fee_per_km = c.deliveryFeePerKm;
  if (c.defaultDeliveryFee !== undefined) row.default_delivery_fee = c.defaultDeliveryFee;
  if (c.commissionPercent !== undefined) row.commission_percent = c.commissionPercent;
  if (c.assignmentMode !== undefined) row.assignment_mode = c.assignmentMode;
  if (c.qrisImage !== undefined) row.qris_image = c.qrisImage;
  if (c.systemOpen !== undefined) row.system_open = c.systemOpen;
  row.updated_at = new Date().toISOString();
  return row;
}

export function mapAuditLogFromDb(row: any): AuditLog {
  return {
    id: row.id,
    action: row.action || 'ACTION',
    userId: row.user_id || 'SYSTEM',
    role: row.role || 'SYSTEM',
    details: row.details || '',
    createdAt: row.created_at || new Date().toISOString()
  };
}

export function mapAuditLogToDb(log: Partial<AuditLog>): Record<string, any> {
  const row: Record<string, any> = {};
  if (log.id !== undefined) row.id = log.id;
  if (log.action !== undefined) row.action = log.action;
  if (log.userId !== undefined) row.user_id = log.userId;
  if (log.role !== undefined) row.role = log.role;
  if (log.details !== undefined) row.details = log.details;
  if (log.createdAt !== undefined) row.created_at = log.createdAt;
  return row;
}

// -----------------------------------------------------------------------------
// Table Mapping Registry
// -----------------------------------------------------------------------------

export const COLLECTION_TO_TABLE: Record<string, string> = {
  merchants: 'merchants',
  categories: 'categories',
  menuItems: 'menu_items',
  drivers: 'drivers',
  orders: 'orders',
  settlements: 'settlements',
  partnerRegistrations: 'partner_registrations',
  testimonials: 'testimonials',
  auditLogs: 'audit_logs',
  systemConfig: 'system_config'
};

export function mapEntityToDb(collection: string, data: any): Record<string, any> {
  switch (collection) {
    case 'merchants': return mapMerchantToDb(data);
    case 'categories': return mapCategoryToDb(data);
    case 'menuItems': return mapMenuItemToDb(data);
    case 'drivers': return mapDriverToDb(data);
    case 'orders': return mapOrderToDb(data);
    case 'settlements': return mapSettlementToDb(data);
    case 'partnerRegistrations': return mapPartnerRegToDb(data);
    case 'testimonials': return mapTestimonialToDb(data);
    case 'auditLogs': return mapAuditLogToDb(data);
    case 'systemConfig': return mapSystemConfigToDb(data);
    default: return { ...data };
  }
}

export function mapEntityFromDb(collection: string, row: any): any {
  switch (collection) {
    case 'merchants': return mapMerchantFromDb(row);
    case 'categories': return mapCategoryFromDb(row);
    case 'menuItems': return mapMenuItemFromDb(row);
    case 'drivers': return mapDriverFromDb(row);
    case 'orders': return mapOrderFromDb(row);
    case 'settlements': return mapSettlementFromDb(row);
    case 'partnerRegistrations': return mapPartnerRegFromDb(row);
    case 'testimonials': return mapTestimonialFromDb(row);
    case 'auditLogs': return mapAuditLogFromDb(row);
    case 'systemConfig': return mapSystemConfigFromDb(row);
    default: return row;
  }
}

// -----------------------------------------------------------------------------
// Live Supabase Database Operations
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Live Supabase Database Operations & Safe Server Diagnostics
// -----------------------------------------------------------------------------

let lastSupabaseError: string | null = null;

export function getLastSupabaseError(): string | null {
  return lastSupabaseError;
}

/**
 * Sanitizes any secret keys, JWT tokens, Bearer headers, or sensitive strings from log messages
 */
export function sanitizeErrorText(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/sbp_[a-zA-Z0-9_-]+/g, '[REDACTED_SUPABASE_KEY]')
    .replace(/Bearer\s+[^\s"'\n]+/gi, 'Bearer [REDACTED]')
    .replace(/apikey:\s*[^\s"'\n]+/gi, 'apikey: [REDACTED]')
    .replace(/password['"]?\s*[:=]\s*['"][^'"]+['"]/gi, 'password="[REDACTED]"');
}

export interface SupabaseDiagnosticDetail {
  message: string;
  code?: string;
  category: 'AUTH' | 'DNS' | 'TLS' | 'NETWORK_TIMEOUT' | 'CONNECTION_REFUSED' | 'TABLE_NOT_FOUND' | 'RLS_DENIED' | 'HTTP_ERROR' | 'NETWORK' | 'UNKNOWN';
  causeCode?: string;
  causeSyscall?: string;
  causeHostname?: string;
  causeMessage?: string;
}

export function formatSupabaseError(err: any): SupabaseDiagnosticDetail {
  if (!err) return { message: 'Unknown error', category: 'UNKNOWN' };

  let targetHost = 'supabase.co';
  try {
    if (foodConfig.supabase.url) {
      targetHost = new URL(foodConfig.supabase.url).hostname;
    }
  } catch {}

  const rawMsg = sanitizeErrorText(String(err?.message || ''));
  const errName = String(err?.name || '');
  const details = sanitizeErrorText(String(err?.details || ''));
  const hint = sanitizeErrorText(String(err?.hint || ''));
  const code = String(err?.code || '');

  // 1. Inspect whether this is a network / fetch-level failure (e.g. Node.js Undici fetch failed, ENOTFOUND, ECONNREFUSED)
  let cause = (err as any)?.cause || (err as any)?.originalError;
  if (cause && Array.isArray((cause as any).errors) && (cause as any).errors.length > 0) {
    cause = (cause as any).errors[0];
  }
  if (cause && cause.cause) {
    cause = cause.cause;
  }

  const causeCode = String(cause?.code || '');
  const causeSyscall = cause?.syscall ? String(cause.syscall) : undefined;
  const causeHostname = cause?.hostname ? String(cause.hostname) : targetHost;
  const causeMsg = sanitizeErrorText(cause?.message || '');

  const isFetchNetworkFailure =
    rawMsg.includes('fetch failed') ||
    errName === 'TypeError' ||
    details.includes('fetch failed') ||
    causeCode === 'ENOTFOUND' ||
    details.includes('ENOTFOUND') ||
    causeCode === 'ECONNREFUSED' ||
    details.includes('ECONNREFUSED') ||
    causeCode === 'ETIMEDOUT' ||
    details.includes('ETIMEDOUT') ||
    details.includes('UND_ERR') ||
    (!code && !hint && details.includes('Error:'));

  if (isFetchNetworkFailure) {
    // DNS Failure (ENOTFOUND, EAI_AGAIN)
    if (
      causeCode === 'ENOTFOUND' ||
      causeCode === 'EAI_AGAIN' ||
      rawMsg.includes('ENOTFOUND') ||
      details.includes('ENOTFOUND') ||
      causeMsg.includes('ENOTFOUND')
    ) {
      return {
        message: `DNS resolution gagal (ENOTFOUND) untuk host "${causeHostname}". Host Supabase tidak ditemukan di internet. Periksa apakah SUPABASE_URL di Vercel sudah benar atau proyek Supabase aktif.`,
        code: causeCode || 'ENOTFOUND',
        category: 'DNS',
        causeCode: causeCode || 'ENOTFOUND',
        causeSyscall: causeSyscall || 'getaddrinfo',
        causeHostname,
        causeMessage: causeMsg || details || rawMsg
      };
    }

    // Connection refused / reset
    if (
      causeCode === 'ECONNREFUSED' ||
      causeCode === 'ECONNRESET' ||
      rawMsg.includes('ECONNREFUSED') ||
      details.includes('ECONNREFUSED')
    ) {
      return {
        message: `Koneksi ditolak (${causeCode || 'ECONNREFUSED'}) oleh endpoint Supabase (${causeHostname}).`,
        code: causeCode || 'ECONNREFUSED',
        category: 'CONNECTION_REFUSED',
        causeCode: causeCode || 'ECONNREFUSED',
        causeSyscall: causeSyscall || 'connect',
        causeHostname,
        causeMessage: causeMsg || details || rawMsg
      };
    }

    // Network Timeout / Abort
    if (
      causeCode === 'ETIMEDOUT' ||
      causeCode === 'UND_ERR_CONNECT_TIMEOUT' ||
      errName === 'AbortError' ||
      rawMsg.toLowerCase().includes('timeout') ||
      details.toLowerCase().includes('timeout') ||
      rawMsg.toLowerCase().includes('aborted')
    ) {
      return {
        message: `Waktu koneksi ke Supabase (${causeHostname}) habis (Timeout). Latensi jaringan melebihi batas waktu 10 detik.`,
        code: causeCode || 'ETIMEDOUT',
        category: 'NETWORK_TIMEOUT',
        causeCode: causeCode || 'ETIMEDOUT',
        causeSyscall: causeSyscall || 'connect',
        causeHostname,
        causeMessage: causeMsg || details || rawMsg
      };
    }

    // TLS / SSL Failure
    if (
      causeCode.startsWith('CERT_') ||
      causeCode.includes('SSL') ||
      causeCode.includes('TLS') ||
      causeCode === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
      causeCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      causeMsg.toLowerCase().includes('certificate') ||
      causeMsg.toLowerCase().includes('ssl') ||
      causeMsg.toLowerCase().includes('tls') ||
      details.toLowerCase().includes('certificate') ||
      details.toLowerCase().includes('ssl')
    ) {
      return {
        message: `Kegagalan verifikasi TLS/SSL saat menghubungi Supabase (${causeCode || causeMsg || 'TLS_ERROR'}).`,
        code: causeCode || 'TLS_ERROR',
        category: 'TLS',
        causeCode: causeCode || 'TLS_ERROR',
        causeHostname,
        causeMessage: causeMsg || details || rawMsg
      };
    }

    // Invalid character in HTTP header (newline / carriage return in key)
    if (
      causeCode === 'ERR_INVALID_CHAR' ||
      rawMsg.includes('Invalid character in header') ||
      causeMsg.includes('Invalid character in header') ||
      details.includes('Invalid character in header')
    ) {
      return {
        message: 'Karakter tidak valid (seperti newline atau spasi tersembunyi) ditemukan pada SUPABASE_SERVICE_ROLE_KEY di Vercel.',
        code: 'ERR_INVALID_CHAR',
        category: 'AUTH',
        causeCode: 'ERR_INVALID_CHAR',
        causeHostname,
        causeMessage: 'Invalid character in headerContent'
      };
    }

    // Generic fetch failed
    return {
      message: causeMsg 
        ? `Koneksi fetch ke Supabase (${causeHostname}) gagal [${causeCode || 'NETWORK_ERROR'}]: ${causeMsg}` 
        : `Koneksi fetch ke Supabase (${causeHostname}) gagal tanpa respons server. Pastikan URL dan koneksi internet aktif.`,
      code: causeCode || 'FETCH_FAILED',
      category: 'NETWORK',
      causeCode: causeCode || 'FETCH_FAILED',
      causeSyscall,
      causeHostname,
      causeMessage: causeMsg || details || rawMsg
    };
  }

  // 2. PostgREST structured error from actual server response
  if (code === 'PGRST301' || rawMsg.toLowerCase().includes('jwt') || rawMsg.toLowerCase().includes('apikey')) {
    return {
      message: `Autentikasi Supabase gagal (HTTP 401/PGRST301): Kredensial SUPABASE_SERVICE_ROLE_KEY tidak valid atau token kedaluwarsa.`,
      code: code || 'AUTH_FAILURE',
      category: 'AUTH',
      causeCode: code,
      causeMessage: rawMsg,
      causeHostname: targetHost
    };
  }

  if (code === '42P01') {
    return {
      message: `Tabel database PostgreSQL tidak ditemukan di Supabase (${rawMsg}). Pastikan migrasi SQL Supabase (supabase_schema.sql) telah diaplikasikan di SQL Editor Supabase.`,
      code,
      category: 'TABLE_NOT_FOUND',
      causeCode: code,
      causeMessage: rawMsg,
      causeHostname: targetHost
    };
  }

  if (code === '42501') {
    return {
      message: `Izin ditolak oleh Row Level Security (RLS) PostgreSQL: ${rawMsg}.`,
      code,
      category: 'RLS_DENIED',
      causeCode: code,
      causeMessage: rawMsg,
      causeHostname: targetHost
    };
  }

  return {
    message: code ? `Supabase PostgREST error [${code}]: ${rawMsg}` : rawMsg,
    code: code || undefined,
    category: code ? 'HTTP_ERROR' : 'UNKNOWN',
    causeCode: code || undefined,
    causeHostname: targetHost,
    causeMessage: rawMsg
  };
}

export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  url: string;
  host: string;
  latencyMs?: number;
  error?: string;
  errorCode?: string;
  category?: string;
  causeCode?: string;
  causeSyscall?: string;
  causeHostname?: string;
  causeMessage?: string;
}> {
  let targetHost = 'unknown-host';
  try {
    if (foodConfig.supabase.url) {
      targetHost = new URL(foodConfig.supabase.url).hostname;
    }
  } catch {}

  if (testSupabaseMock?.probeResult !== undefined) {
    return {
      host: targetHost,
      ...testSupabaseMock.probeResult
    };
  }

  if (!foodConfig.supabase.url) {
    return {
      connected: false,
      url: '',
      host: targetHost,
      error: 'SUPABASE_URL belum dikonfigurasi di environment variables Vercel (contoh: https://<project-ref>.supabase.co).',
      category: 'CONFIG_MISSING',
      errorCode: 'CONFIG_MISSING_URL'
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      connected: false,
      url: foodConfig.supabase.url,
      host: targetHost,
      error: 'Kredensial Supabase belum lengkap (SUPABASE_SERVICE_ROLE_KEY wajib disetel di Vercel).',
      category: 'AUTH',
      errorCode: 'AUTH_MISSING_KEY'
    };
  }

  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    // Probe primary operational table "merchants" first
    const { data: mData, error: mError } = await client
      .from('merchants')
      .select('id, name')
      .limit(1)
      .abortSignal(controller.signal);

    if (mError) {
      // If merchants table does not exist (42P01), probe system_config as fallback
      if (mError.code === '42P01') {
        const { error: cfgError } = await client
          .from('system_config')
          .select('id')
          .limit(1)
          .abortSignal(controller.signal);

        if (!cfgError) {
          lastSupabaseError = null;
          return {
            connected: true,
            url: foodConfig.supabase.url,
            host: targetHost,
            latencyMs: Date.now() - start,
            category: 'OK'
          };
        }
      }

      const formatted = formatSupabaseError(mError);
      lastSupabaseError = formatted.message;
      console.warn(`[Supabase Connection Probe Failed] Category: ${formatted.category}, Code: ${formatted.causeCode || formatted.code}, Host: ${targetHost}: ${formatted.message}`);
      return {
        connected: false,
        url: foodConfig.supabase.url,
        host: targetHost,
        latencyMs: Date.now() - start,
        error: formatted.message,
        errorCode: formatted.code,
        category: formatted.category,
        causeCode: formatted.causeCode,
        causeSyscall: formatted.causeSyscall,
        causeHostname: formatted.causeHostname,
        causeMessage: formatted.causeMessage
      };
    }

    lastSupabaseError = null;
    return {
      connected: true,
      url: foodConfig.supabase.url,
      host: targetHost,
      latencyMs: Date.now() - start,
      category: 'OK'
    };
  } catch (err: any) {
    const formatted = formatSupabaseError(err);
    lastSupabaseError = formatted.message;
    console.error(`[Supabase Connection Probe Exception] Category: ${formatted.category}, CauseCode: ${formatted.causeCode}, Syscall: ${formatted.causeSyscall || 'N/A'}, Host: ${targetHost}: ${formatted.message}`);
    return {
      connected: false,
      url: foodConfig.supabase.url,
      host: targetHost,
      latencyMs: Date.now() - start,
      error: formatted.message,
      errorCode: formatted.code,
      category: formatted.category,
      causeCode: formatted.causeCode,
      causeSyscall: formatted.causeSyscall,
      causeHostname: formatted.causeHostname,
      causeMessage: formatted.causeMessage
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function safeSupabaseUpsertDocDetailed(
  collection: string,
  id: string,
  data: any
): Promise<{ success: boolean; error?: string }> {
  if (testSupabaseMock) {
    testSupabaseMock.onUpsert?.(collection, id, data);
    if (testSupabaseMock.upsertSuccess !== undefined) {
      if (!testSupabaseMock.upsertSuccess) {
        const err = testSupabaseMock.upsertError || `Mocked Supabase upsert error for ${collection}/${id}`;
        lastSupabaseError = err;
        return { success: false, error: err };
      }
      lastSupabaseError = null;
      return { success: true };
    }
  }

  const client = getSupabaseClient();
  if (!client) {
    const msg = 'Klien Supabase belum terkonfigurasi.';
    lastSupabaseError = msg;
    return { success: false, error: msg };
  }

  const table = COLLECTION_TO_TABLE[collection];
  if (!table) {
    const msg = `Tabel Supabase tidak ditemukan untuk koleksi "${collection}".`;
    lastSupabaseError = msg;
    return { success: false, error: msg };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const row = mapEntityToDb(collection, { ...data, id });
    const { error } = await client
      .from(table)
      .upsert(row, { onConflict: 'id' })
      .abortSignal(controller.signal);

    if (error) {
      const formatted = formatSupabaseError(error);
      console.warn(`[SupabaseAdapter] Upsert failed for table ${table} id ${id}:`, formatted.message);
      lastSupabaseError = formatted.message;
      return { success: false, error: formatted.message };
    }
    lastSupabaseError = null;
    return { success: true };
  } catch (err: any) {
    const formatted = formatSupabaseError(err);
    console.warn(`[SupabaseAdapter] Exception during upsert for ${table} id ${id}:`, formatted.message);
    lastSupabaseError = formatted.message;
    return { success: false, error: formatted.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function safeSupabaseUpsertDoc(
  collection: string,
  id: string,
  data: any
): Promise<boolean> {
  const result = await safeSupabaseUpsertDocDetailed(collection, id, data);
  return result.success;
}

export async function safeSupabaseDeleteDocDetailed(
  collection: string,
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (testSupabaseMock) {
    testSupabaseMock.onDelete?.(collection, id);
    if (testSupabaseMock.deleteSuccess !== undefined) {
      if (!testSupabaseMock.deleteSuccess) {
        const err = testSupabaseMock.deleteError || `Mocked Supabase delete error for ${collection}/${id}`;
        lastSupabaseError = err;
        return { success: false, error: err };
      }
      lastSupabaseError = null;
      return { success: true };
    }
  }

  const client = getSupabaseClient();
  if (!client) {
    const msg = 'Klien Supabase belum terkonfigurasi.';
    lastSupabaseError = msg;
    return { success: false, error: msg };
  }

  const table = COLLECTION_TO_TABLE[collection];
  if (!table) {
    const msg = `Tabel Supabase tidak ditemukan untuk koleksi "${collection}".`;
    lastSupabaseError = msg;
    return { success: false, error: msg };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const { error } = await client
      .from(table)
      .delete()
      .eq('id', id)
      .abortSignal(controller.signal);

    if (error) {
      const formatted = formatSupabaseError(error);
      console.warn(`[SupabaseAdapter] Delete failed for table ${table} id ${id}:`, formatted.message);
      lastSupabaseError = formatted.message;
      return { success: false, error: formatted.message };
    }
    lastSupabaseError = null;
    return { success: true };
  } catch (err: any) {
    const formatted = formatSupabaseError(err);
    console.warn(`[SupabaseAdapter] Exception during delete for ${table} id ${id}:`, formatted.message);
    lastSupabaseError = formatted.message;
    return { success: false, error: formatted.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function safeSupabaseDeleteDoc(
  collection: string,
  id: string
): Promise<boolean> {
  const result = await safeSupabaseDeleteDocDetailed(collection, id);
  return result.success;
}

export async function fetchFromSupabase(
  collection: string,
  options?: {
    filter?: Record<string, any>;
    limit?: number;
    orderBy?: { column: string; ascending?: boolean };
  }
): Promise<any[]> {
  if (testSupabaseMock?.fetchResult !== undefined) {
    return testSupabaseMock.fetchResult;
  }
  const client = getSupabaseClient();
  if (!client) return [];

  const table = COLLECTION_TO_TABLE[collection];
  if (!table) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    let query = client.from(table).select('*');

    if (options?.filter) {
      for (const [key, val] of Object.entries(options.filter)) {
        query = query.eq(key, val);
      }
    }

    if (options?.orderBy) {
      query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? false });
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query.abortSignal(controller.signal);
    if (error) {
      const formatted = formatSupabaseError(error);
      console.warn(`[SupabaseAdapter] Fetch failed for ${table}:`, formatted.message);
      return [];
    }

    return (data || []).map((row: any) => mapEntityFromDb(collection, row));
  } catch (err: any) {
    const formatted = formatSupabaseError(err);
    console.warn(`[SupabaseAdapter] Exception fetching from ${table}:`, formatted.message);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Granular query for orders belonging to a specific merchant.
 * Completely eliminates whole-table scans and protects against quota exhaustion.
 */
export async function fetchOrdersByMerchantFromSupabase(merchantId: string): Promise<Order[]> {
  const client = getSupabaseClient();
  if (!client || !merchantId) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const { data, error } = await client
      .from('orders')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false })
      .abortSignal(controller.signal);

    if (error) {
      const formatted = formatSupabaseError(error);
      console.warn(`[SupabaseAdapter] fetchOrdersByMerchant failed:`, formatted.message);
      return [];
    }

    return (data || []).map(row => mapOrderFromDb(row));
  } catch (err: any) {
    const formatted = formatSupabaseError(err);
    console.warn(`[SupabaseAdapter] Exception in fetchOrdersByMerchant:`, formatted.message);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Granular query for orders assigned to a specific driver.
 */
export async function fetchOrdersByDriverFromSupabase(driverId: string): Promise<Order[]> {
  const client = getSupabaseClient();
  if (!client || !driverId) return [];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const { data, error } = await client
      .from('orders')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .abortSignal(controller.signal);

    if (error) {
      const formatted = formatSupabaseError(error);
      console.warn(`[SupabaseAdapter] fetchOrdersByDriver failed:`, formatted.message);
      return [];
    }

    return (data || []).map(row => mapOrderFromDb(row));
  } catch (err: any) {
    const formatted = formatSupabaseError(err);
    console.warn(`[SupabaseAdapter] Exception in fetchOrdersByDriver:`, formatted.message);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

