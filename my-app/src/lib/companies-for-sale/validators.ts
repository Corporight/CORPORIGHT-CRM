import { z } from 'zod'
import {
  COMPANY_FOR_SALE_STATUSES,
  COMPANY_FOR_SALE_SOURCE_TYPES,
} from '@/db/schema'

// ── createCompanyForSale ───────────────────────────────────────────

export const createCompanyForSaleSchema = z.object({
  // Must be an existing COMPANY subject that is active.
  subjectId: z.string().uuid(),
  sourceType: z.enum(COMPANY_FOR_SALE_SOURCE_TYPES),
  basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/, 'basePrice must be a decimal string, e.g. "9900.00"'),
  // Defaults to basePrice when omitted.
  currentPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, 'currentPrice must be a decimal string').optional(),
  note: z.string().optional(),
  createdBy: z.string().uuid().optional(),
})

export type CreateCompanyForSaleInput = z.input<typeof createCompanyForSaleSchema>

// ── reserveCompanyForSale ──────────────────────────────────────────

export const reserveCompanyForSaleSchema = z.object({
  companyForSaleId: z.string().uuid(),
  // The SHELF_PURCHASE order executing this sale.
  orderId: z.string().uuid(),
  reservedBy: z.string().uuid().optional(),
})

export type ReserveCompanyForSaleInput = z.input<typeof reserveCompanyForSaleSchema>

// ── releaseCompanyForSaleReservation ───────────────────────────────

export const releaseCompanyForSaleReservationSchema = z.object({
  companyForSaleId: z.string().uuid(),
  releasedBy: z.string().uuid().optional(),
})

export type ReleaseCompanyForSaleReservationInput = z.input<typeof releaseCompanyForSaleReservationSchema>

// ── markCompanyForSaleSold ─────────────────────────────────────────

export const markCompanyForSaleSoldSchema = z.object({
  companyForSaleId: z.string().uuid(),
  soldBy: z.string().uuid().optional(),
})

export type MarkCompanyForSaleSoldInput = z.input<typeof markCompanyForSaleSoldSchema>

// ── withdrawCompanyForSale ─────────────────────────────────────────

export const withdrawCompanyForSaleSchema = z.object({
  companyForSaleId: z.string().uuid(),
  withdrawnBy: z.string().uuid().optional(),
  note: z.string().optional(),
})

export type WithdrawCompanyForSaleInput = z.input<typeof withdrawCompanyForSaleSchema>

// ── listCompaniesForSale ───────────────────────────────────────────

export const listCompaniesForSaleSchema = z.object({
  status: z.enum(COMPANY_FOR_SALE_STATUSES).optional(),
  sourceType: z.enum(COMPANY_FOR_SALE_SOURCE_TYPES).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
})

export type ListCompaniesForSaleInput = z.input<typeof listCompaniesForSaleSchema>
