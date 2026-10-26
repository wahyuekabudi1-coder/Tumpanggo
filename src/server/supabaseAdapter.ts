/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tumpang Food Supabase PostgreSQL Adapter
 * Enterprise-grade client adapter providing full compatibility with the existing foodDb interface.
 * Implements granular table queries, strict parameter filtering, and zero whole-table scans.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { foodConfig } from './config';
import {
  Merchant, Category, MenuItem, Order, Driver, Settlement, AuditLog, SystemConfig,
  PartnerRegistration, Testimonial
} from '../types';

let supabaseClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return foodConfig.supabase.isConfigured;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!foodConfig.supabase.isConfigured) {
    return null;
  }
  if (!supabaseClient) {
    const url = foodConfig.supabase.url;
    const key = foodConfig.supabase.serviceRoleKey || foodConfig.supabase.anonKey;
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
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

export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  url: string;
  latencyMs?: number;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      connected: false,
      url: foodConfig.supabase.url,
      error: 'Supabase credentials not configured (SUPABASE_SERVICE_ROLE_KEY missing).'
    };
  }

  const start = Date.now();
  try {
    const { error } = await client
      .from('system_config')
      .select('id')
      .limit(1);

    if (error) {
      return {
        connected: false,
        url: foodConfig.supabase.url,
        latencyMs: Date.now() - start,
        error: error.message
      };
    }

    return {
      connected: true,
      url: foodConfig.supabase.url,
      latencyMs: Date.now() - start
    };
  } catch (err: any) {
    return {
      connected: false,
      url: foodConfig.supabase.url,
      latencyMs: Date.now() - start,
      error: err.message
    };
  }
}

export async function safeSupabaseUpsertDoc(
  collection: string,
  id: string,
  data: any
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const table = COLLECTION_TO_TABLE[collection];
  if (!table) return false;

  try {
    const row = mapEntityToDb(collection, { ...data, id });
    const { error } = await client
      .from(table)
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.warn(`[SupabaseAdapter] Upsert failed for table ${table} id ${id}:`, error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`[SupabaseAdapter] Exception during upsert for ${table} id ${id}:`, err.message);
    return false;
  }
}

export async function safeSupabaseDeleteDoc(
  collection: string,
  id: string
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const table = COLLECTION_TO_TABLE[collection];
  if (!table) return false;

  try {
    const { error } = await client
      .from(table)
      .delete()
      .eq('id', id);

    if (error) {
      console.warn(`[SupabaseAdapter] Delete failed for table ${table} id ${id}:`, error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`[SupabaseAdapter] Exception during delete for ${table} id ${id}:`, err.message);
    return false;
  }
}

export async function fetchFromSupabase(
  collection: string,
  options?: {
    filter?: Record<string, any>;
    limit?: number;
    orderBy?: { column: string; ascending?: boolean };
  }
): Promise<any[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  const table = COLLECTION_TO_TABLE[collection];
  if (!table) return [];

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

    const { data, error } = await query;
    if (error) {
      console.warn(`[SupabaseAdapter] Fetch failed for ${table}:`, error.message);
      return [];
    }

    return (data || []).map(row => mapEntityFromDb(collection, row));
  } catch (err: any) {
    console.warn(`[SupabaseAdapter] Exception fetching from ${table}:`, err.message);
    return [];
  }
}

/**
 * Granular query for orders belonging to a specific merchant.
 * Completely eliminates whole-table scans and protects against quota exhaustion.
 */
export async function fetchOrdersByMerchantFromSupabase(merchantId: string): Promise<Order[]> {
  const client = getSupabaseClient();
  if (!client || !merchantId) return [];

  try {
    const { data, error } = await client
      .from('orders')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn(`[SupabaseAdapter] fetchOrdersByMerchant failed:`, error.message);
      return [];
    }

    return (data || []).map(row => mapOrderFromDb(row));
  } catch (err: any) {
    console.warn(`[SupabaseAdapter] Exception in fetchOrdersByMerchant:`, err.message);
    return [];
  }
}

/**
 * Granular query for orders assigned to a specific driver.
 */
export async function fetchOrdersByDriverFromSupabase(driverId: string): Promise<Order[]> {
  const client = getSupabaseClient();
  if (!client || !driverId) return [];

  try {
    const { data, error } = await client
      .from('orders')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn(`[SupabaseAdapter] fetchOrdersByDriver failed:`, error.message);
      return [];
    }

    return (data || []).map(row => mapOrderFromDb(row));
  } catch (err: any) {
    console.warn(`[SupabaseAdapter] Exception in fetchOrdersByDriver:`, err.message);
    return [];
  }
}

