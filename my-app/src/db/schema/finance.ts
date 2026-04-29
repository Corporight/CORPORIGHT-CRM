// finance.ts — Phase 1 Finance module
//
// Seven tables: centers, financial_tree_categories, financial_tree_types,
// financial_tree_details, payment_groups, financial_movements, payment_allocations.
//
// Key invariants:
//   - payment_groups.center_id is NOT NULL — seed centers before creating groups
//   - financial_movements.center_id is NOT NULL — required for all movements
//   - financial_movements tree linkage (category + type + detail) is required
//   - Only INCOME payment groups may have payment_allocations
//   - payment_groups.processing_status: NEW → PARTIALLY_ALLOCATED → FULLY_ALLOCATED
//     (recalculated from ACTIVE allocations — never manually edited)
//   - payment_allocations are soft-cancelled (status = CANCELLED), never deleted
//   - Order payment status is computed from allocations — not stored on orders
//
// Spec inconsistencies documented:
//   - financial_tree_categories uses FINANCIAL_TREE_CATEGORY_DIRECTIONS (INCOME/EXPENSE/INTERNAL/BOTH);
//     payment_groups and financial_movements use FINANCE_DIRECTIONS (INCOME/EXPENSE/INTERNAL only) —
//     BOTH must not be used on movements or payment groups
//   - processing_status: spec says NEW in entity definition, UNALLOCATED in prose;
//     this schema uses NEW as the initial status
//   - amount_gross = amount_net + vat_amount: enforced at app layer only (Zod + service)
//   - NO_VAT → vat_amount = 0: enforced at app layer only
//
// Phase 2 deferred:
//   - vat_registration_id FK (table not yet in schema)
//   - template_id FK (movement_templates out of Phase 1 scope)
//   - BANK_IMPORT source mechanics

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  check,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './shared'
import { subjects } from './subjects'
import { orders } from './orders'
import { orderItems } from './orders'

// ── Controlled vocabularies ────────────────────────────────────────

export const FINANCE_DIRECTIONS = ['INCOME', 'EXPENSE', 'INTERNAL'] as const
export type FinanceDirection = (typeof FINANCE_DIRECTIONS)[number]

// Superset of FINANCE_DIRECTIONS — categories allow BOTH to classify correction documents
// that span income and expense. BOTH is NOT valid for movements or payment groups.
export const FINANCIAL_TREE_CATEGORY_DIRECTIONS = [
  'INCOME', 'EXPENSE', 'INTERNAL', 'BOTH',
] as const
export type FinancialTreeCategoryDirection = (typeof FINANCIAL_TREE_CATEGORY_DIRECTIONS)[number]

export const PAYMENT_GROUP_PROCESSING_STATUSES = [
  'NEW',
  'PARTIALLY_ALLOCATED',
  'FULLY_ALLOCATED',
  'CANCELLED',
] as const
export type PaymentGroupProcessingStatus =
  (typeof PAYMENT_GROUP_PROCESSING_STATUSES)[number]

export const PAYMENT_GROUP_SOURCES = ['MANUAL', 'CASH', 'BANK_IMPORT'] as const
export type PaymentGroupSource = (typeof PAYMENT_GROUP_SOURCES)[number]

export const FINANCIAL_MOVEMENT_VAT_MODES = [
  'NO_VAT',
  'STANDARD',
  'REVERSE_CHARGE',
] as const
export type FinancialMovementVatMode =
  (typeof FINANCIAL_MOVEMENT_VAT_MODES)[number]

export const PAYMENT_ALLOCATION_STATUSES = ['ACTIVE', 'CANCELLED'] as const
export type PaymentAllocationStatus =
  (typeof PAYMENT_ALLOCATION_STATUSES)[number]

// ── centers ───────────────────────────────────────────────────────
// Cost/profit centers. Required on payment_groups and financial_movements.
// Seed at least one center before creating any finance records.
export const centers = pgTable('centers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  vatMode: text('vat_mode').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── financial_tree_categories ──────────────────────────────────────
// Top level of the 3-level financial classification tree.
export const financialTreeCategories = pgTable(
  'financial_tree_categories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    direction: text('direction').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'ftc_direction_check',
      sql`${table.direction} IN (${sql.raw(FINANCIAL_TREE_CATEGORY_DIRECTIONS.map((d) => `'${d}'`).join(', '))})`,
    ),
  ],
)

// ── financial_tree_types ───────────────────────────────────────────
// Second level. Must belong to an existing category.
export const financialTreeTypes = pgTable('financial_tree_types', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  code: text('code').notNull().unique(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => financialTreeCategories.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── financial_tree_details ─────────────────────────────────────────
// Leaf nodes (third level). Required on all financial_movements in Phase 1.
export const financialTreeDetails = pgTable('financial_tree_details', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  code: text('code').notNull().unique(),
  typeId: uuid('type_id')
    .notNull()
    .references(() => financialTreeTypes.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── payment_groups ─────────────────────────────────────────────────
// A payment event (bank transfer, cash payment, etc.).
// processing_status is recalculated by recalculatePaymentGroupAllocationState()
// on every allocation create/cancel. Never manually edited.
export const paymentGroups = pgTable(
  'payment_groups',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    centerId: uuid('center_id')
      .notNull()
      .references(() => centers.id, { onDelete: 'restrict' }),
    direction: text('direction').notNull(),
    totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
    allocatedAmount: numeric('allocated_amount', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    processingStatus: text('processing_status').notNull().default('NEW'),
    currency: text('currency').notNull().default('CZK'),
    transactionDate: date('transaction_date').notNull(),
    counterpartySubjectId: uuid('counterparty_subject_id').references(
      () => subjects.id,
      { onDelete: 'set null' },
    ),
    counterpartyName: text('counterparty_name'),
    counterpartyAccountNumber: text('counterparty_account_number'),
    counterpartyBankCode: text('counterparty_bank_code'),
    variableSymbol: text('variable_symbol'),
    constantSymbol: text('constant_symbol'),
    specificSymbol: text('specific_symbol'),
    bankReference: text('bank_reference'),
    source: text('source').notNull().default('MANUAL'),
    note: text('note'),
    noteInternal: text('note_internal'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    check(
      'pg_direction_check',
      sql`${table.direction} IN ('INCOME', 'EXPENSE', 'INTERNAL')`,
    ),
    check(
      'pg_status_check',
      sql`${table.processingStatus} IN ('NEW', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED', 'CANCELLED')`,
    ),
    check(
      'pg_source_check',
      sql`${table.source} IN ('MANUAL', 'CASH', 'BANK_IMPORT')`,
    ),
    check('pg_total_amount_check', sql`${table.totalAmount} > 0`),
    check('pg_allocated_amount_check', sql`${table.allocatedAmount} >= 0`),
    index('idx_payment_groups_status').on(table.processingStatus),
    index('idx_payment_groups_direction').on(table.direction),
  ],
)

// ── financial_movements ────────────────────────────────────────────
// Individual ledger entries. All three tree levels are required in Phase 1.
// Phase 2 deferred FKs: vat_registration_id, template_id
export const financialMovements = pgTable(
  'financial_movements',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    paymentGroupId: uuid('payment_group_id').references(() => paymentGroups.id, {
      onDelete: 'restrict',
    }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    orderItemId: uuid('order_item_id').references(() => orderItems.id, {
      onDelete: 'set null',
    }),
    subjectId: uuid('subject_id').references(() => subjects.id, {
      onDelete: 'set null',
    }),
    // Phase 2: add FK → vat_registrations.id once that table is created
    vatRegistrationId: uuid('vat_registration_id'),
    centerId: uuid('center_id')
      .notNull()
      .references(() => centers.id, { onDelete: 'restrict' }),
    direction: text('direction').notNull(),
    amountGross: numeric('amount_gross', { precision: 14, scale: 2 }).notNull(),
    amountNet: numeric('amount_net', { precision: 14, scale: 2 }).notNull(),
    vatAmount: numeric('vat_amount', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    vatMode: text('vat_mode').notNull().default('NO_VAT'),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).notNull().default('0'),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => financialTreeCategories.id, { onDelete: 'restrict' }),
    typeId: uuid('type_id')
      .notNull()
      .references(() => financialTreeTypes.id, { onDelete: 'restrict' }),
    detailId: uuid('detail_id')
      .notNull()
      .references(() => financialTreeDetails.id, { onDelete: 'restrict' }),
    description: text('description').notNull(),
    movementDate: date('movement_date').notNull(),
    accountingDate: date('accounting_date'),
    documentNumber: text('document_number'),
    documentDate: date('document_date'),
    // Phase 2: add FK → movement_templates.id once that table is created
    templateId: uuid('template_id'),
    note: text('note'),
    noteInternal: text('note_internal'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    check(
      'fm_direction_check',
      sql`${table.direction} IN ('INCOME', 'EXPENSE', 'INTERNAL')`,
    ),
    check(
      'fm_vat_mode_check',
      sql`${table.vatMode} IN ('NO_VAT', 'STANDARD', 'REVERSE_CHARGE')`,
    ),
    check('fm_amount_gross_check', sql`${table.amountGross} >= 0`),
    check('fm_amount_net_check', sql`${table.amountNet} >= 0`),
    check('fm_vat_amount_check', sql`${table.vatAmount} >= 0`),
    index('idx_financial_movements_order').on(table.orderId),
    index('idx_financial_movements_payment_group').on(table.paymentGroupId),
    index('idx_financial_movements_movement_date').on(table.movementDate),
    index('idx_financial_movements_direction').on(table.direction),
  ],
)

// ── payment_allocations ────────────────────────────────────────────
// Links an INCOME payment group to an order for a specific amount.
// Soft-cancel only (status = CANCELLED, row retained) — append-only pattern.
export const paymentAllocations = pgTable(
  'payment_allocations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    paymentGroupId: uuid('payment_group_id')
      .notNull()
      .references(() => paymentGroups.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    allocatedAmount: numeric('allocated_amount', {
      precision: 14,
      scale: 2,
    }).notNull(),
    status: text('status').notNull().default('ACTIVE'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    check(
      'pa_status_check',
      sql`${table.status} IN ('ACTIVE', 'CANCELLED')`,
    ),
    check('pa_allocated_amount_check', sql`${table.allocatedAmount} > 0`),
    index('idx_payment_allocations_order').on(table.orderId),
    index('idx_payment_allocations_group').on(table.paymentGroupId),
    index('idx_payment_allocations_status').on(table.status),
  ],
)

// ── TypeScript types ───────────────────────────────────────────────
export type Center = typeof centers.$inferSelect
export type FinancialTreeCategory = typeof financialTreeCategories.$inferSelect
export type FinancialTreeType = typeof financialTreeTypes.$inferSelect
export type FinancialTreeDetail = typeof financialTreeDetails.$inferSelect
export type PaymentGroup = typeof paymentGroups.$inferSelect
export type FinancialMovement = typeof financialMovements.$inferSelect
export type PaymentAllocation = typeof paymentAllocations.$inferSelect
