import { z } from 'zod'
import {
  FINANCE_DIRECTIONS,
  PAYMENT_GROUP_SOURCES,
  FINANCIAL_MOVEMENT_VAT_MODES,
} from '@/db/schema'

// ── Shared ─────────────────────────────────────────────────────────

const decimalString = (label: string) =>
  z.string().regex(/^\d+(\.\d{1,2})?$/, `${label} must be a decimal string, e.g. "100.00"`)

const dateString = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date string YYYY-MM-DD`)

// ── createCenter ───────────────────────────────────────────────────

export const createCenterSchema = z.object({
  code: z.string().min(1, 'code is required'),
  name: z.string().min(1, 'name is required'),
  vatMode: z.enum(FINANCIAL_MOVEMENT_VAT_MODES),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
  createdBy: z.string().uuid().optional(),
})
export type CreateCenterInput = z.input<typeof createCenterSchema>

// ── createFinancialTreeCategory ────────────────────────────────────

export const createFinancialTreeCategorySchema = z.object({
  code: z.string().min(1, 'code is required'),
  name: z.string().min(1, 'name is required'),
  direction: z.enum(FINANCE_DIRECTIONS),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
})
export type CreateFinancialTreeCategoryInput = z.input<typeof createFinancialTreeCategorySchema>

// ── createFinancialTreeType ────────────────────────────────────────

export const createFinancialTreeTypeSchema = z.object({
  code: z.string().min(1, 'code is required'),
  categoryId: z.string().uuid('categoryId must be a UUID'),
  name: z.string().min(1, 'name is required'),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
})
export type CreateFinancialTreeTypeInput = z.input<typeof createFinancialTreeTypeSchema>

// ── createFinancialTreeDetail ──────────────────────────────────────

export const createFinancialTreeDetailSchema = z.object({
  code: z.string().min(1, 'code is required'),
  typeId: z.string().uuid('typeId must be a UUID'),
  name: z.string().min(1, 'name is required'),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
})
export type CreateFinancialTreeDetailInput = z.input<typeof createFinancialTreeDetailSchema>

// ── createPaymentGroup ─────────────────────────────────────────────
// source BANK_IMPORT is excluded — bank import is Phase 2.

export const createPaymentGroupSchema = z.object({
  centerId: z.string().uuid('centerId must be a UUID'),
  direction: z.enum(FINANCE_DIRECTIONS),
  totalAmount: decimalString('totalAmount'),
  currency: z.string().min(1).optional().default('CZK'),
  transactionDate: dateString('transactionDate'),
  counterpartySubjectId: z.string().uuid().optional(),
  counterpartyName: z.string().optional(),
  counterpartyAccountNumber: z.string().optional(),
  counterpartyBankCode: z.string().optional(),
  variableSymbol: z.string().optional(),
  constantSymbol: z.string().optional(),
  specificSymbol: z.string().optional(),
  bankReference: z.string().optional(),
  // BANK_IMPORT excluded in Phase 1
  source: z.enum(['MANUAL', 'CASH']).optional().default('MANUAL'),
  note: z.string().optional(),
  noteInternal: z.string().optional(),
  createdBy: z.string().uuid().optional(),
})
export type CreatePaymentGroupInput = z.input<typeof createPaymentGroupSchema>

// ── createFinancialMovement ────────────────────────────────────────

export const createFinancialMovementSchema = z.object({
  paymentGroupId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  orderItemId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  vatRegistrationId: z.string().uuid().optional(),
  centerId: z.string().uuid('centerId must be a UUID'),
  direction: z.enum(FINANCE_DIRECTIONS),
  amountGross: decimalString('amountGross'),
  amountNet: decimalString('amountNet'),
  vatAmount: decimalString('vatAmount').optional().default('0'),
  vatMode: z.enum(FINANCIAL_MOVEMENT_VAT_MODES).optional().default('NO_VAT'),
  vatRate: decimalString('vatRate').optional().default('0'),
  categoryId: z.string().uuid('categoryId must be a UUID'),
  typeId: z.string().uuid('typeId must be a UUID'),
  detailId: z.string().uuid('detailId must be a UUID'),
  description: z.string().min(1, 'description is required'),
  movementDate: dateString('movementDate'),
  accountingDate: dateString('accountingDate').optional(),
  documentNumber: z.string().optional(),
  documentDate: dateString('documentDate').optional(),
  note: z.string().optional(),
  noteInternal: z.string().optional(),
  createdBy: z.string().uuid().optional(),
})
export type CreateFinancialMovementInput = z.input<typeof createFinancialMovementSchema>

// ── createPaymentAllocation ────────────────────────────────────────

export const createPaymentAllocationSchema = z.object({
  paymentGroupId: z.string().uuid('paymentGroupId must be a UUID'),
  orderId: z.string().uuid('orderId must be a UUID'),
  allocatedAmount: decimalString('allocatedAmount'),
  note: z.string().optional(),
  createdBy: z.string().uuid().optional(),
})
export type CreatePaymentAllocationInput = z.input<typeof createPaymentAllocationSchema>

// ── cancelPaymentAllocation ────────────────────────────────────────

export const cancelPaymentAllocationSchema = z.object({
  paymentAllocationId: z.string().uuid('paymentAllocationId must be a UUID'),
  cancelledBy: z.string().uuid().optional(),
})
export type CancelPaymentAllocationInput = z.input<typeof cancelPaymentAllocationSchema>

// ── listPaymentGroups ──────────────────────────────────────────────

export const listPaymentGroupsSchema = z.object({
  direction: z.enum(FINANCE_DIRECTIONS).optional(),
  processingStatus: z.enum(['NEW', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED', 'CANCELLED'] as const).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
})
export type ListPaymentGroupsInput = z.input<typeof listPaymentGroupsSchema>

// ── listFinancialMovements ─────────────────────────────────────────

export const listFinancialMovementsSchema = z.object({
  orderId: z.string().uuid().optional(),
  direction: z.enum(FINANCE_DIRECTIONS).optional(),
  movementDateFrom: dateString('movementDateFrom').optional(),
  movementDateTo: dateString('movementDateTo').optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
})
export type ListFinancialMovementsInput = z.input<typeof listFinancialMovementsSchema>
