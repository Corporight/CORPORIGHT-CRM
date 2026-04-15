# Phase 1 Finance Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Phase 1 finance core — manual income/expense recording, payment allocation to orders, computed order payment status, and actual order economics.

**Architecture:** Seven new DB tables in `src/db/schema/finance.ts`. Internal helpers for recalculation in `src/lib/finance/helpers.ts`. All public mutations and queries exposed as Next.js Server Actions in `src/lib/finance/actions.ts`. Order payment status is pure-computed from live allocations — no payment_status column on orders.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Drizzle ORM 0.45.2, PostgreSQL, Zod 4, TypeScript.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `my-app/src/db/schema/finance.ts` | Create | All 7 finance tables |
| `my-app/src/db/schema/index.ts` | Modify | Add `export * from './finance'` |
| `my-app/src/lib/finance/validators.ts` | Create | Zod input schemas for all actions |
| `my-app/src/lib/finance/helpers.ts` | Create | Internal: Tx type, computeOrderTotal, computeOrderPaymentStatus, recalculatePaymentGroupAllocationState, recalculateOrderPaymentStatus |
| `my-app/src/lib/finance/actions.ts` | Create | `'use server'` public API: 14 functions |
| `my-app/scripts/smoke-finance.ts` | Create | Smoke test covering all 6 scenarios |

---

## Task 1: Finance schema

**Files:**
- Create: `my-app/src/db/schema/finance.ts`
- Modify: `my-app/src/db/schema/index.ts`

- [ ] **Step 1: Create `src/db/schema/finance.ts`**

```typescript
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
//   - direction BOTH (seen in CORRECTION seed data) is not in vocabulary; use INTERNAL
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
  // Default VAT mode for movements in this center.
  vatMode: text('vat_mode').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── financial_tree_categories ──────────────────────────────────────
// Top level of the 3-level financial classification tree.
// direction INTERNAL is used for CORRECTION and similar cross-entries.
// Note: spec seed data uses BOTH for CORRECTION; this is inconsistent with
// the vocabulary definition. INTERNAL is used here until spec is resolved.
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
      sql`${table.direction} IN ('INCOME', 'EXPENSE', 'INTERNAL')`,
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
// General envelope — supports INCOME, EXPENSE, and INTERNAL directions.
// Only INCOME groups may have payment_allocations created against them.
//
// processing_status is recalculated by recalculatePaymentGroupAllocationState()
// on every allocation create/cancel. Never manually edited.
//
// Spec note: initial status is NEW (entity definition). UNALLOCATED appears
// in spec prose and is treated as an editorial inconsistency — not a valid value.
//
// version is incremented by the service layer on every UPDATE for optimistic
// locking. No DB-level trigger; service layer is responsible.
//
// source = BANK_IMPORT is in the vocabulary but Phase 1 service layer rejects it.
// Bank import mechanics are Phase 2.
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
// Individual ledger entries. Supports INCOME, EXPENSE, and INTERNAL.
// All three tree levels (category + type + detail) are required in Phase 1.
// center_id is required in Phase 1.
//
// If payment_group_id is set, movement.direction must equal payment_group.direction.
// Enforced in the service layer, not at DB level.
//
// Phase 2 deferred FKs:
//   vat_registration_id — no FK until vat_registrations table is added
//   template_id — no FK until movement_templates table is added
//
// VAT integrity (enforced at app layer, not DB level):
//   amount_gross = amount_net + vat_amount
//   vat_mode = NO_VAT → vat_amount must be 0
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
    // Nullable per spec — not always known at entry time
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
// Phase 1 design choice: soft-cancel (status = CANCELLED, row retained).
// Rationale: consistent with append-only/non-destructive pattern used in
// relations, relation_events, and aml_records throughout this codebase.
//
// payment_group_id must reference an INCOME payment group — enforced at app layer.
// allocated_amount must not cause payment_group.allocated_amount to exceed
// payment_group.total_amount — enforced at app layer with SELECT FOR UPDATE.
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
```

- [ ] **Step 2: Update `src/db/schema/index.ts`**

Add `export * from './finance'` as the last line:

```typescript
// Central schema export — drizzle.config.ts points here.
// Add new module schemas as they are implemented.

export * from './shared'
export * from './subjects'
export * from './companies-for-sale'
export * from './orders'
export * from './relations'
export * from './aml'
export * from './finance'
```

- [ ] **Step 3: Run typecheck to verify schema compiles**

```bash
cd my-app && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "C:\Corporight\Claude\Corporight CRM 1.0" && git add my-app/src/db/schema/ && git commit -m "feat: add Phase 1 finance schema (7 tables)"
```

---

## Task 2: Generate and apply Drizzle migration

**Files:**
- Create: `my-app/drizzle/000N_<auto-name>.sql` (generated)

- [ ] **Step 1: Generate migration**

```bash
cd my-app && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/corporight_crm npx drizzle-kit generate 2>&1
```

Expected: a new `.sql` file appears in `my-app/drizzle/`. The file creates all 7 finance tables plus indexes and check constraints. Verify the generated SQL contains `CREATE TABLE centers`, `CREATE TABLE payment_groups`, etc.

- [ ] **Step 2: Apply migration**

```bash
cd my-app && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/corporight_crm npx drizzle-kit migrate 2>&1
```

Expected output contains: `All migrations applied successfully` or similar confirmation. No errors.

- [ ] **Step 3: Verify tables exist in DB**

```bash
cd my-app && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/corporight_crm npx tsx -e "
const postgres = (await import('postgres')).default
const sql = postgres(process.env.DATABASE_URL!)
const rows = await sql\`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('centers','financial_tree_categories','financial_tree_types','financial_tree_details','payment_groups','financial_movements','payment_allocations') ORDER BY table_name\`
console.log(rows.map((r: any) => r.table_name))
await sql.end()
" 2>&1
```

Expected: 7 table names printed.

- [ ] **Step 4: Commit migration**

```bash
cd "C:\Corporight\Claude\Corporight CRM 1.0" && git add my-app/drizzle/ && git commit -m "feat: apply finance module migration"
```

---

## Task 3: Finance validators

**Files:**
- Create: `my-app/src/lib/finance/validators.ts`

- [ ] **Step 1: Create `src/lib/finance/validators.ts`**

```typescript
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
```

- [ ] **Step 2: Run typecheck**

```bash
cd my-app && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "C:\Corporight\Claude\Corporight CRM 1.0" && git add my-app/src/lib/finance/ && git commit -m "feat: add finance validators"
```

---

## Task 4: Finance internal helpers

**Files:**
- Create: `my-app/src/lib/finance/helpers.ts`

- [ ] **Step 1: Create `src/lib/finance/helpers.ts`**

```typescript
// helpers.ts — internal finance helpers
//
// These functions are called INSIDE db.transaction() callbacks by actions.ts.
// They are not exported as Server Actions — do not add 'use server' here.
//
// Tx type: the transaction client passed to a db.transaction() callback.
//
// Decimal arithmetic: all NUMERIC columns return as strings from Drizzle.
// toScaled() converts to integer cents to avoid floating-point comparison errors.
// Safe for amounts up to ~90 trillion (below Number.MAX_SAFE_INTEGER / 100).

import { db } from '@/db'
import {
  paymentGroups,
  paymentAllocations,
  orderItems,
} from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'

// ── Tx type ────────────────────────────────────────────────────────
// The transaction argument passed to db.transaction(async (tx) => { ... }).
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// ── PaymentStatus ──────────────────────────────────────────────────
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID'

// ── Internal decimal utility ───────────────────────────────────────
// Converts a decimal string to scaled integer (cents). Rounds to 2dp.
function toScaled(amount: string | null | undefined): number {
  return Math.round(parseFloat(amount ?? '0') * 100)
}

// ── computeOrderPaymentStatus ──────────────────────────────────────
// Pure function — no DB access.
//
// Rules:
//   allocated = 0              → UNPAID
//   0 < allocated < total      → PARTIALLY_PAID
//   allocated = total          → PAID
//   allocated > total          → OVERPAID
//
// Phase 1 note: orderTotal is computed from live order_items.
// Phase 2: switch to reading from orders.snapshot after confirmation.
export function computeOrderPaymentStatus(
  allocatedAmount: string,
  orderTotal: string,
): PaymentStatus {
  const allocated = toScaled(allocatedAmount)
  const total = toScaled(orderTotal)
  if (allocated === 0) return 'UNPAID'
  if (allocated < total) return 'PARTIALLY_PAID'
  if (allocated === total) return 'PAID'
  return 'OVERPAID'
}

// ── computeOrderTotal ──────────────────────────────────────────────
// Sums order_items.total_price for the order.
// Phase 1: reads live order_items regardless of confirmation status.
// Returns '0' if no items exist.
export async function computeOrderTotal(tx: Tx, orderId: string): Promise<string> {
  const [result] = await tx
    .select({
      total: sql<string>`coalesce(sum(${orderItems.totalPrice})::text, '0')`,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
  return result?.total ?? '0'
}

// ── recalculateOrderPaymentStatus ──────────────────────────────────
// Computes the current payment status for an order from ACTIVE allocations.
// Does not write anything — caller decides whether to audit a transition.
export async function recalculateOrderPaymentStatus(
  tx: Tx,
  orderId: string,
): Promise<PaymentStatus> {
  const [allocationResult] = await tx
    .select({
      total: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmount})::text, '0')`,
    })
    .from(paymentAllocations)
    .where(
      and(
        eq(paymentAllocations.orderId, orderId),
        eq(paymentAllocations.status, 'ACTIVE'),
      ),
    )
  const allocated = allocationResult?.total ?? '0'
  const orderTotal = await computeOrderTotal(tx, orderId)
  return computeOrderPaymentStatus(allocated, orderTotal)
}

// ── recalculatePaymentGroupAllocationState ─────────────────────────
// Recomputes allocated_amount and processing_status from ACTIVE allocations.
// Updates the payment_group row. Increments version.
//
// processing_status rules:
//   allocated = 0              → NEW
//   0 < allocated < total      → PARTIALLY_ALLOCATED
//   allocated >= total         → FULLY_ALLOCATED
//
// Callers must have already acquired a SELECT FOR UPDATE lock on the
// payment_group row before calling this function.
export async function recalculatePaymentGroupAllocationState(
  tx: Tx,
  paymentGroupId: string,
): Promise<{ allocatedAmount: string; processingStatus: string }> {
  // Re-read totalAmount (safe — caller holds FOR UPDATE lock).
  const [pg] = await tx
    .select({ totalAmount: paymentGroups.totalAmount })
    .from(paymentGroups)
    .where(eq(paymentGroups.id, paymentGroupId))

  if (!pg) {
    throw new Error(`Payment group not found during recalculation: ${paymentGroupId}`)
  }

  const [allocationResult] = await tx
    .select({
      total: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmount})::text, '0')`,
    })
    .from(paymentAllocations)
    .where(
      and(
        eq(paymentAllocations.paymentGroupId, paymentGroupId),
        eq(paymentAllocations.status, 'ACTIVE'),
      ),
    )

  const allocatedAmount = allocationResult?.total ?? '0'
  const allocated = toScaled(allocatedAmount)
  const total = toScaled(pg.totalAmount)

  let processingStatus: string
  if (allocated === 0) {
    processingStatus = 'NEW'
  } else if (allocated < total) {
    processingStatus = 'PARTIALLY_ALLOCATED'
  } else {
    processingStatus = 'FULLY_ALLOCATED'
  }

  await tx
    .update(paymentGroups)
    .set({
      allocatedAmount,
      processingStatus,
      version: sql`${paymentGroups.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(paymentGroups.id, paymentGroupId))

  return { allocatedAmount, processingStatus }
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd my-app && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "C:\Corporight\Claude\Corporight CRM 1.0" && git add my-app/src/lib/finance/helpers.ts && git commit -m "feat: add finance internal helpers"
```

---

## Task 5: Finance actions — setup functions

**Files:**
- Create: `my-app/src/lib/finance/actions.ts`

- [ ] **Step 1: Create `src/lib/finance/actions.ts` with setup functions**

```typescript
'use server'

// Finance service — Phase 1 core.
//
// Public functions:
//   Setup:  createCenter, createFinancialTreeCategory,
//           createFinancialTreeType, createFinancialTreeDetail
//   Core:   createPaymentGroup, createFinancialMovement,
//           createPaymentAllocation, cancelPaymentAllocation
//   Reads:  listPaymentGroups, listFinancialMovements,
//           listAllocationsForOrder, getOrderPaymentStatus,
//           getOrderEconomics
//
// Order payment status is COMPUTED from payment_allocations — never stored
// on the orders table. See helpers.ts for computation logic.
//
// Phase 1 scope limitations:
//   - BANK_IMPORT source rejected at service layer
//   - Only INCOME payment groups accept allocations
//   - Order total from live order_items (Phase 2: switch to orders.snapshot)
//   - vat_registration_id and template_id stored but not FK-validated

import { db } from '@/db'
import {
  centers,
  financialTreeCategories,
  financialTreeTypes,
  financialTreeDetails,
  paymentGroups,
  financialMovements,
  paymentAllocations,
  auditLog,
  orders,
  orderItems,
} from '@/db/schema'
import { eq, and, gte, lte, sql } from 'drizzle-orm'
import {
  createCenterSchema,
  createFinancialTreeCategorySchema,
  createFinancialTreeTypeSchema,
  createFinancialTreeDetailSchema,
  createPaymentGroupSchema,
  createFinancialMovementSchema,
  createPaymentAllocationSchema,
  cancelPaymentAllocationSchema,
  listPaymentGroupsSchema,
  listFinancialMovementsSchema,
  type CreateCenterInput,
  type CreateFinancialTreeCategoryInput,
  type CreateFinancialTreeTypeInput,
  type CreateFinancialTreeDetailInput,
  type CreatePaymentGroupInput,
  type CreateFinancialMovementInput,
  type CreatePaymentAllocationInput,
  type CancelPaymentAllocationInput,
  type ListPaymentGroupsInput,
  type ListFinancialMovementsInput,
} from './validators'
import {
  recalculatePaymentGroupAllocationState,
  recalculateOrderPaymentStatus,
  computeOrderTotal,
  computeOrderPaymentStatus,
  type PaymentStatus,
} from './helpers'

// ── Result type ────────────────────────────────────────────────────

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// ── createCenter ───────────────────────────────────────────────────

export async function createCenter(
  input: CreateCenterInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createCenterSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { code, name, vatMode, isActive, sortOrder, createdBy } = parsed.data

  try {
    const [record] = await db
      .insert(centers)
      .values({ code, name, vatMode, isActive, sortOrder })
      .returning({ id: centers.id })

    return { success: true, data: { id: record.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('uq_centers_code') || message.includes('centers_code_unique')) {
      return { success: false, error: `A center with code '${code}' already exists.` }
    }
    return { success: false, error: message }
  }
}

// ── createFinancialTreeCategory ────────────────────────────────────

export async function createFinancialTreeCategory(
  input: CreateFinancialTreeCategoryInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createFinancialTreeCategorySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { code, name, direction, isActive, sortOrder } = parsed.data

  try {
    const [record] = await db
      .insert(financialTreeCategories)
      .values({ code, name, direction, isActive, sortOrder })
      .returning({ id: financialTreeCategories.id })

    return { success: true, data: { id: record.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('financial_tree_categories_code_unique')) {
      return { success: false, error: `A category with code '${code}' already exists.` }
    }
    return { success: false, error: message }
  }
}

// ── createFinancialTreeType ────────────────────────────────────────

export async function createFinancialTreeType(
  input: CreateFinancialTreeTypeInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createFinancialTreeTypeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { code, categoryId, name, isActive, sortOrder } = parsed.data

  const category = await db.query.financialTreeCategories.findFirst({
    where: eq(financialTreeCategories.id, categoryId),
    columns: { id: true },
  })
  if (!category) {
    return { success: false, error: `Financial tree category not found: ${categoryId}` }
  }

  try {
    const [record] = await db
      .insert(financialTreeTypes)
      .values({ code, categoryId, name, isActive, sortOrder })
      .returning({ id: financialTreeTypes.id })

    return { success: true, data: { id: record.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('financial_tree_types_code_unique')) {
      return { success: false, error: `A type with code '${code}' already exists.` }
    }
    return { success: false, error: message }
  }
}

// ── createFinancialTreeDetail ──────────────────────────────────────

export async function createFinancialTreeDetail(
  input: CreateFinancialTreeDetailInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createFinancialTreeDetailSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { code, typeId, name, isActive, sortOrder } = parsed.data

  const type = await db.query.financialTreeTypes.findFirst({
    where: eq(financialTreeTypes.id, typeId),
    columns: { id: true },
  })
  if (!type) {
    return { success: false, error: `Financial tree type not found: ${typeId}` }
  }

  try {
    const [record] = await db
      .insert(financialTreeDetails)
      .values({ code, typeId, name, isActive, sortOrder })
      .returning({ id: financialTreeDetails.id })

    return { success: true, data: { id: record.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('financial_tree_details_code_unique')) {
      return { success: false, error: `A detail with code '${code}' already exists.` }
    }
    return { success: false, error: message }
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd my-app && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "C:\Corporight\Claude\Corporight CRM 1.0" && git add my-app/src/lib/finance/actions.ts && git commit -m "feat: add finance setup actions (center + tree)"
```

---

## Task 6: Finance actions — createPaymentGroup

**Files:**
- Modify: `my-app/src/lib/finance/actions.ts` (append)

- [ ] **Step 1: Append `createPaymentGroup` to `actions.ts`**

```typescript
// ── createPaymentGroup ─────────────────────────────────────────────
// Creates a payment event envelope (INCOME, EXPENSE, or INTERNAL).
// BANK_IMPORT source is rejected — bank import is Phase 2.
// Initial processing_status is NEW (no allocations yet).

export async function createPaymentGroup(
  input: CreatePaymentGroupInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createPaymentGroupSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const {
    centerId, direction, totalAmount, currency, transactionDate,
    counterpartySubjectId, counterpartyName, counterpartyAccountNumber,
    counterpartyBankCode, variableSymbol, constantSymbol, specificSymbol,
    bankReference, source, note, noteInternal, createdBy,
  } = parsed.data

  // Verify center exists.
  const center = await db.query.centers.findFirst({
    where: eq(centers.id, centerId),
    columns: { id: true },
  })
  if (!center) {
    return { success: false, error: `Center not found: ${centerId}` }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [record] = await tx
        .insert(paymentGroups)
        .values({
          centerId,
          direction,
          totalAmount,
          allocatedAmount: '0',
          processingStatus: 'NEW',
          currency,
          transactionDate,
          counterpartySubjectId: counterpartySubjectId ?? null,
          counterpartyName: counterpartyName ?? null,
          counterpartyAccountNumber: counterpartyAccountNumber ?? null,
          counterpartyBankCode: counterpartyBankCode ?? null,
          variableSymbol: variableSymbol ?? null,
          constantSymbol: constantSymbol ?? null,
          specificSymbol: specificSymbol ?? null,
          bankReference: bankReference ?? null,
          source: source ?? 'MANUAL',
          note: note ?? null,
          noteInternal: noteInternal ?? null,
          version: 1,
          createdBy: createdBy ?? null,
        })
        .returning({ id: paymentGroups.id })

      await tx.insert(auditLog).values({
        entityType: 'payment_group',
        entityId: record.id,
        action: 'PAYMENT_GROUP_CREATED',
        diff: { direction, totalAmount, currency, transactionDate, source },
        userId: createdBy ?? null,
      })

      return record
    })

    return { success: true, data: { id: result.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd my-app && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "C:\Corporight\Claude\Corporight CRM 1.0" && git add my-app/src/lib/finance/actions.ts && git commit -m "feat: add createPaymentGroup action"
```

---

## Task 7: Finance actions — createFinancialMovement

**Files:**
- Modify: `my-app/src/lib/finance/actions.ts` (append)

- [ ] **Step 1: Append `createFinancialMovement` to `actions.ts`**

```typescript
// ── createFinancialMovement ────────────────────────────────────────
// Records a single income or expense entry in the ledger.
//
// Validations enforced here (not at DB level):
//   1. amount_gross = amount_net + vat_amount
//   2. vat_mode = NO_VAT → vat_amount must be 0
//   3. Tree linkage integrity: type.category_id must match input categoryId;
//      detail.type_id must match input typeId
//   4. If payment_group_id is set: movement.direction must match
//      payment_group.direction

export async function createFinancialMovement(
  input: CreateFinancialMovementInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createFinancialMovementSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const {
    paymentGroupId, orderId, orderItemId, subjectId, vatRegistrationId,
    centerId, direction, amountGross, amountNet, vatAmount, vatMode, vatRate,
    categoryId, typeId, detailId, description, movementDate, accountingDate,
    documentNumber, documentDate, note, noteInternal, createdBy,
  } = parsed.data

  // 1. VAT integrity: amount_gross = amount_net + vat_amount
  const scaledGross = Math.round(parseFloat(amountGross) * 100)
  const scaledNet   = Math.round(parseFloat(amountNet) * 100)
  const scaledVat   = Math.round(parseFloat(vatAmount ?? '0') * 100)
  if (scaledGross !== scaledNet + scaledVat) {
    return {
      success: false,
      error: `amount_gross (${amountGross}) must equal amount_net (${amountNet}) + vat_amount (${vatAmount ?? '0'}).`,
    }
  }

  // 2. NO_VAT mode → vat_amount must be 0
  if ((vatMode ?? 'NO_VAT') === 'NO_VAT' && scaledVat !== 0) {
    return {
      success: false,
      error: `vat_mode is NO_VAT but vat_amount is ${vatAmount}. vat_amount must be 0 when vat_mode is NO_VAT.`,
    }
  }

  // 3. Validate tree linkage integrity.
  const detail = await db.query.financialTreeDetails.findFirst({
    where: eq(financialTreeDetails.id, detailId),
    columns: { id: true, typeId: true },
  })
  if (!detail) {
    return { success: false, error: `Financial tree detail not found: ${detailId}` }
  }
  if (detail.typeId !== typeId) {
    return {
      success: false,
      error: `Detail ${detailId} does not belong to type ${typeId}.`,
    }
  }

  const type = await db.query.financialTreeTypes.findFirst({
    where: eq(financialTreeTypes.id, typeId),
    columns: { id: true, categoryId: true },
  })
  if (!type) {
    return { success: false, error: `Financial tree type not found: ${typeId}` }
  }
  if (type.categoryId !== categoryId) {
    return {
      success: false,
      error: `Type ${typeId} does not belong to category ${categoryId}.`,
    }
  }

  // 4. If payment_group_id set: validate existence and direction match.
  if (paymentGroupId) {
    const pg = await db.query.paymentGroups.findFirst({
      where: eq(paymentGroups.id, paymentGroupId),
      columns: { id: true, direction: true },
    })
    if (!pg) {
      return { success: false, error: `Payment group not found: ${paymentGroupId}` }
    }
    if (pg.direction !== direction) {
      return {
        success: false,
        error:
          `Movement direction (${direction}) must match payment group direction (${pg.direction}).`,
      }
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [record] = await tx
        .insert(financialMovements)
        .values({
          paymentGroupId: paymentGroupId ?? null,
          orderId: orderId ?? null,
          orderItemId: orderItemId ?? null,
          subjectId: subjectId ?? null,
          vatRegistrationId: vatRegistrationId ?? null,
          centerId,
          direction,
          amountGross,
          amountNet,
          vatAmount: vatAmount ?? '0',
          vatMode: vatMode ?? 'NO_VAT',
          vatRate: vatRate ?? '0',
          categoryId,
          typeId,
          detailId,
          description,
          movementDate,
          accountingDate: accountingDate ?? null,
          documentNumber: documentNumber ?? null,
          documentDate: documentDate ?? null,
          note: note ?? null,
          noteInternal: noteInternal ?? null,
          createdBy: createdBy ?? null,
        })
        .returning({ id: financialMovements.id })

      await tx.insert(auditLog).values({
        entityType: 'financial_movement',
        entityId: record.id,
        action: 'FINANCIAL_MOVEMENT_CREATED',
        diff: {
          direction, amountGross, amountNet, vatAmount: vatAmount ?? '0',
          vatMode: vatMode ?? 'NO_VAT', orderId: orderId ?? null,
          movementDate, description,
        },
        userId: createdBy ?? null,
      })

      return record
    })

    return { success: true, data: { id: result.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd my-app && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "C:\Corporight\Claude\Corporight CRM 1.0" && git add my-app/src/lib/finance/actions.ts && git commit -m "feat: add createFinancialMovement action"
```

---

## Task 8: Finance actions — createPaymentAllocation + cancelPaymentAllocation

**Files:**
- Modify: `my-app/src/lib/finance/actions.ts` (append)

- [ ] **Step 1: Append `createPaymentAllocation` to `actions.ts`**

```typescript
// ── createPaymentAllocation ────────────────────────────────────────
// Links an INCOME payment group to an order for a specific amount.
// Only INCOME payment groups may be allocated.
//
// Concurrency: SELECT FOR UPDATE on payment_group before checking limits.
// This prevents two concurrent allocations from both passing the limit check
// and together exceeding total_amount.
//
// On success:
//   - Recalculates payment_group.allocated_amount and processing_status
//   - Computes order payment status before and after
//   - Writes ORDER_PAYMENT_STATUS_CHANGED audit row if status changed

export async function createPaymentAllocation(
  input: CreatePaymentAllocationInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createPaymentAllocationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { paymentGroupId, orderId, allocatedAmount, note, createdBy } = parsed.data

  // Pre-checks outside tx: verify order and payment group exist.
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { id: true },
  })
  if (!order) {
    return { success: false, error: `Order not found: ${orderId}` }
  }

  const pgCheck = await db.query.paymentGroups.findFirst({
    where: eq(paymentGroups.id, paymentGroupId),
    columns: { id: true, direction: true, processingStatus: true },
  })
  if (!pgCheck) {
    return { success: false, error: `Payment group not found: ${paymentGroupId}` }
  }
  if (pgCheck.direction !== 'INCOME') {
    return {
      success: false,
      error:
        `Payment allocations can only be created against INCOME payment groups. ` +
        `Payment group ${paymentGroupId} has direction ${pgCheck.direction}.`,
    }
  }
  if (pgCheck.processingStatus === 'CANCELLED') {
    return {
      success: false,
      error: `Cannot allocate to a CANCELLED payment group: ${paymentGroupId}.`,
    }
  }

  try {
    const result = await db.transaction(async (tx): Promise<{ error: string } | { id: string }> => {
      // Lock the payment group row to prevent concurrent over-allocation.
      const [pg] = await tx
        .select({
          id: paymentGroups.id,
          totalAmount: paymentGroups.totalAmount,
          allocatedAmount: paymentGroups.allocatedAmount,
        })
        .from(paymentGroups)
        .where(eq(paymentGroups.id, paymentGroupId))
        .for('update')

      if (!pg) {
        return { error: `Payment group not found inside transaction: ${paymentGroupId}` }
      }

      // Compute new allocated total and check it does not exceed total_amount.
      const currentAllocated = Math.round(parseFloat(pg.allocatedAmount) * 100)
      const newAllocation    = Math.round(parseFloat(allocatedAmount) * 100)
      const pgTotal          = Math.round(parseFloat(pg.totalAmount) * 100)

      if (currentAllocated + newAllocation > pgTotal) {
        const remaining = ((pgTotal - currentAllocated) / 100).toFixed(2)
        return {
          error:
            `Allocation of ${allocatedAmount} would exceed payment group total. ` +
            `Current allocated: ${pg.allocatedAmount}, group total: ${pg.totalAmount}. ` +
            `Remaining capacity: ${remaining}.`,
        }
      }

      // Compute old order payment status (before this allocation).
      const oldStatus = await recalculateOrderPaymentStatus(tx, orderId)

      // Insert the allocation.
      const [record] = await tx
        .insert(paymentAllocations)
        .values({
          paymentGroupId,
          orderId,
          allocatedAmount,
          status: 'ACTIVE',
          note: note ?? null,
          createdBy: createdBy ?? null,
        })
        .returning({ id: paymentAllocations.id })

      // Recalculate payment group allocation state.
      await recalculatePaymentGroupAllocationState(tx, paymentGroupId)

      // Compute new order payment status.
      const newStatus = await recalculateOrderPaymentStatus(tx, orderId)

      // Audit: order payment status changed.
      if (oldStatus !== newStatus) {
        const orderTotal = await computeOrderTotal(tx, orderId)
        const [allocationResult] = await tx
          .select({
            total: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmount})::text, '0')`,
          })
          .from(paymentAllocations)
          .where(
            and(
              eq(paymentAllocations.orderId, orderId),
              eq(paymentAllocations.status, 'ACTIVE'),
            ),
          )
        const allocatedTotal = allocationResult?.total ?? '0'

        await tx.insert(auditLog).values({
          entityType: 'order',
          entityId: orderId,
          action: 'ORDER_PAYMENT_STATUS_CHANGED',
          diff: {
            previousStatus: oldStatus,
            newStatus,
            allocatedAmount: allocatedTotal,
            orderTotal,
          },
          userId: createdBy ?? null,
        })
      }

      // Audit: allocation created.
      await tx.insert(auditLog).values({
        entityType: 'payment_allocation',
        entityId: record.id,
        action: 'PAYMENT_ALLOCATION_CREATED',
        diff: { paymentGroupId, orderId, allocatedAmount },
        userId: createdBy ?? null,
      })

      return { id: record.id }
    })

    if ('error' in result) {
      return { success: false, error: result.error }
    }
    return { success: true, data: { id: result.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── cancelPaymentAllocation ────────────────────────────────────────
// Soft-cancels an ACTIVE allocation.
// Uses conditional UPDATE WHERE status='ACTIVE' + .returning() to detect
// concurrent cancellations (same race-condition pattern as CompaniesForSale).
//
// On success:
//   - Sets status = CANCELLED, cancelled_at = now
//   - Recalculates payment_group allocation state
//   - Computes order payment status before and after
//   - Writes ORDER_PAYMENT_STATUS_CHANGED audit row if status changed

export async function cancelPaymentAllocation(
  input: CancelPaymentAllocationInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = cancelPaymentAllocationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { paymentAllocationId, cancelledBy } = parsed.data

  try {
    const now = new Date()

    const result = await db.transaction(async (tx): Promise<{ error: string } | { id: string }> => {
      // Read current allocation (for paymentGroupId + orderId needed below).
      const current = await tx.query.paymentAllocations.findFirst({
        where: eq(paymentAllocations.id, paymentAllocationId),
        columns: {
          id: true,
          paymentGroupId: true,
          orderId: true,
          allocatedAmount: true,
          status: true,
        },
      })
      if (!current) {
        return { error: `Payment allocation not found: ${paymentAllocationId}` }
      }
      if (current.status === 'CANCELLED') {
        return { error: `Payment allocation ${paymentAllocationId} is already CANCELLED.` }
      }

      // Lock the payment group before recalculation.
      await tx
        .select({ id: paymentGroups.id })
        .from(paymentGroups)
        .where(eq(paymentGroups.id, current.paymentGroupId))
        .for('update')

      // Compute old order payment status.
      const oldStatus = await recalculateOrderPaymentStatus(tx, current.orderId)

      // Conditional UPDATE — rejects if row was already cancelled concurrently.
      const [updated] = await tx
        .update(paymentAllocations)
        .set({
          status: 'CANCELLED',
          cancelledAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(paymentAllocations.id, paymentAllocationId),
            eq(paymentAllocations.status, 'ACTIVE'),
          ),
        )
        .returning({ id: paymentAllocations.id })

      if (!updated) {
        return {
          error:
            `Cannot cancel: allocation ${paymentAllocationId} is not ACTIVE. ` +
            `It may have been cancelled concurrently.`,
        }
      }

      // Recalculate payment group allocation state.
      await recalculatePaymentGroupAllocationState(tx, current.paymentGroupId)

      // Compute new order payment status.
      const newStatus = await recalculateOrderPaymentStatus(tx, current.orderId)

      // Audit: order payment status changed.
      if (oldStatus !== newStatus) {
        const orderTotal = await computeOrderTotal(tx, current.orderId)
        const [allocationResult] = await tx
          .select({
            total: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmount})::text, '0')`,
          })
          .from(paymentAllocations)
          .where(
            and(
              eq(paymentAllocations.orderId, current.orderId),
              eq(paymentAllocations.status, 'ACTIVE'),
            ),
          )
        const allocatedTotal = allocationResult?.total ?? '0'

        await tx.insert(auditLog).values({
          entityType: 'order',
          entityId: current.orderId,
          action: 'ORDER_PAYMENT_STATUS_CHANGED',
          diff: {
            previousStatus: oldStatus,
            newStatus,
            allocatedAmount: allocatedTotal,
            orderTotal,
          },
          userId: cancelledBy ?? null,
        })
      }

      // Audit: allocation cancelled.
      await tx.insert(auditLog).values({
        entityType: 'payment_allocation',
        entityId: paymentAllocationId,
        action: 'PAYMENT_ALLOCATION_CANCELLED',
        diff: {
          paymentGroupId: current.paymentGroupId,
          orderId: current.orderId,
          allocatedAmount: current.allocatedAmount,
          cancelledAt: now.toISOString(),
        },
        userId: cancelledBy ?? null,
      })

      return { id: paymentAllocationId }
    })

    if ('error' in result) {
      return { success: false, error: result.error }
    }
    return { success: true, data: { id: result.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd my-app && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "C:\Corporight\Claude\Corporight CRM 1.0" && git add my-app/src/lib/finance/actions.ts && git commit -m "feat: add createPaymentAllocation and cancelPaymentAllocation"
```

---

## Task 9: Finance actions — reads and order economics

**Files:**
- Modify: `my-app/src/lib/finance/actions.ts` (append)

- [ ] **Step 1: Append read functions and `getOrderEconomics` to `actions.ts`**

```typescript
// ── listPaymentGroups ──────────────────────────────────────────────

export type PaymentGroupListItem = {
  id: string
  centerId: string
  direction: string
  totalAmount: string
  allocatedAmount: string
  processingStatus: string
  currency: string
  transactionDate: string
  source: string
  note: string | null
  createdAt: Date
  updatedAt: Date
}

export async function listPaymentGroups(
  input: ListPaymentGroupsInput = {},
): Promise<ActionResult<{ items: PaymentGroupListItem[]; total: number }>> {
  const parsed = listPaymentGroupsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { direction, processingStatus, limit, offset } = parsed.data

  const where =
    direction && processingStatus
      ? and(
          eq(paymentGroups.direction, direction),
          eq(paymentGroups.processingStatus, processingStatus),
        )
      : direction
        ? eq(paymentGroups.direction, direction)
        : processingStatus
          ? eq(paymentGroups.processingStatus, processingStatus)
          : undefined

  try {
    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: paymentGroups.id,
          centerId: paymentGroups.centerId,
          direction: paymentGroups.direction,
          totalAmount: paymentGroups.totalAmount,
          allocatedAmount: paymentGroups.allocatedAmount,
          processingStatus: paymentGroups.processingStatus,
          currency: paymentGroups.currency,
          transactionDate: paymentGroups.transactionDate,
          source: paymentGroups.source,
          note: paymentGroups.note,
          createdAt: paymentGroups.createdAt,
          updatedAt: paymentGroups.updatedAt,
        })
        .from(paymentGroups)
        .where(where)
        .orderBy(paymentGroups.createdAt)
        .limit(limit)
        .offset(offset),

      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(paymentGroups)
        .where(where),
    ])

    return {
      success: true,
      data: {
        items: rows as PaymentGroupListItem[],
        total: countRows[0].count,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── listFinancialMovements ─────────────────────────────────────────

export type FinancialMovementListItem = {
  id: string
  paymentGroupId: string | null
  orderId: string | null
  centerId: string
  direction: string
  amountGross: string
  amountNet: string
  vatAmount: string
  vatMode: string
  description: string
  movementDate: string
  createdAt: Date
}

export async function listFinancialMovements(
  input: ListFinancialMovementsInput = {},
): Promise<ActionResult<{ items: FinancialMovementListItem[]; total: number }>> {
  const parsed = listFinancialMovementsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { orderId, direction, movementDateFrom, movementDateTo, limit, offset } = parsed.data

  const conditions = []
  if (orderId)          conditions.push(eq(financialMovements.orderId, orderId))
  if (direction)        conditions.push(eq(financialMovements.direction, direction))
  if (movementDateFrom) conditions.push(gte(financialMovements.movementDate, movementDateFrom))
  if (movementDateTo)   conditions.push(lte(financialMovements.movementDate, movementDateTo))

  const where = conditions.length > 1
    ? and(...(conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))
    : conditions[0]

  try {
    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: financialMovements.id,
          paymentGroupId: financialMovements.paymentGroupId,
          orderId: financialMovements.orderId,
          centerId: financialMovements.centerId,
          direction: financialMovements.direction,
          amountGross: financialMovements.amountGross,
          amountNet: financialMovements.amountNet,
          vatAmount: financialMovements.vatAmount,
          vatMode: financialMovements.vatMode,
          description: financialMovements.description,
          movementDate: financialMovements.movementDate,
          createdAt: financialMovements.createdAt,
        })
        .from(financialMovements)
        .where(where)
        .orderBy(financialMovements.movementDate)
        .limit(limit)
        .offset(offset),

      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(financialMovements)
        .where(where),
    ])

    return {
      success: true,
      data: {
        items: rows as FinancialMovementListItem[],
        total: countRows[0].count,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── listAllocationsForOrder ────────────────────────────────────────

export type PaymentAllocationItem = {
  id: string
  paymentGroupId: string
  orderId: string
  allocatedAmount: string
  status: string
  cancelledAt: Date | null
  note: string | null
  createdAt: Date
}

export async function listAllocationsForOrder(
  orderId: string,
): Promise<ActionResult<{ items: PaymentAllocationItem[] }>> {
  if (!orderId || typeof orderId !== 'string') {
    return { success: false, error: 'orderId is required.' }
  }

  try {
    const rows = await db
      .select({
        id: paymentAllocations.id,
        paymentGroupId: paymentAllocations.paymentGroupId,
        orderId: paymentAllocations.orderId,
        allocatedAmount: paymentAllocations.allocatedAmount,
        status: paymentAllocations.status,
        cancelledAt: paymentAllocations.cancelledAt,
        note: paymentAllocations.note,
        createdAt: paymentAllocations.createdAt,
      })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.orderId, orderId))
      .orderBy(paymentAllocations.createdAt)

    return { success: true, data: { items: rows as PaymentAllocationItem[] } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── getOrderPaymentStatus ──────────────────────────────────────────
// Computes order payment status on demand from ACTIVE allocations.
// Phase 1: order total from live order_items.

export async function getOrderPaymentStatus(
  orderId: string,
): Promise<ActionResult<{ status: PaymentStatus; allocatedAmount: string; orderTotal: string }>> {
  if (!orderId || typeof orderId !== 'string') {
    return { success: false, error: 'orderId is required.' }
  }

  try {
    const [allocationResult] = await db
      .select({
        total: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmount})::text, '0')`,
      })
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.orderId, orderId),
          eq(paymentAllocations.status, 'ACTIVE'),
        ),
      )

    const allocatedAmount = allocationResult?.total ?? '0'

    const [itemsResult] = await db
      .select({
        total: sql<string>`coalesce(sum(${orderItems.totalPrice})::text, '0')`,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))

    const orderTotal = itemsResult?.total ?? '0'
    const status = computeOrderPaymentStatus(allocatedAmount, orderTotal)

    return { success: true, data: { status, allocatedAmount, orderTotal } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── getOrderEconomics ──────────────────────────────────────────────
// Computes actual Phase 1 order economics.
//
//   allocatedPayments = SUM(ACTIVE payment_allocations.allocated_amount) for order
//   expenseTotal      = SUM(financial_movements.amount_gross) WHERE order_id = this
//                       AND direction = EXPENSE
//   actualProfit      = allocatedPayments - expenseTotal (may be negative)
//   paymentStatus     = computeOrderPaymentStatus(allocatedPayments, orderTotal)
//
// Phase 2 follow-up: include registration costs via vat_registration_id.

export type OrderEconomics = {
  allocatedPayments: string
  expenseTotal: string
  actualProfit: string
  paymentStatus: PaymentStatus
  orderTotal: string
}

export async function getOrderEconomics(
  orderId: string,
): Promise<ActionResult<OrderEconomics>> {
  if (!orderId || typeof orderId !== 'string') {
    return { success: false, error: 'orderId is required.' }
  }

  try {
    const [allocationResult, expenseResult, itemsResult] = await Promise.all([
      db
        .select({
          total: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmount})::text, '0')`,
        })
        .from(paymentAllocations)
        .where(
          and(
            eq(paymentAllocations.orderId, orderId),
            eq(paymentAllocations.status, 'ACTIVE'),
          ),
        ),

      db
        .select({
          total: sql<string>`coalesce(sum(${financialMovements.amountGross})::text, '0')`,
        })
        .from(financialMovements)
        .where(
          and(
            eq(financialMovements.orderId, orderId),
            eq(financialMovements.direction, 'EXPENSE'),
          ),
        ),

      db
        .select({
          total: sql<string>`coalesce(sum(${orderItems.totalPrice})::text, '0')`,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId)),
    ])

    const allocatedPayments = allocationResult[0]?.total ?? '0'
    const expenseTotal      = expenseResult[0]?.total ?? '0'
    const orderTotal        = itemsResult[0]?.total ?? '0'

    const profitScaled =
      Math.round(parseFloat(allocatedPayments) * 100) -
      Math.round(parseFloat(expenseTotal) * 100)
    const actualProfit = (profitScaled / 100).toFixed(2)

    const paymentStatus = computeOrderPaymentStatus(allocatedPayments, orderTotal)

    return {
      success: true,
      data: { allocatedPayments, expenseTotal, actualProfit, paymentStatus, orderTotal },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd my-app && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "C:\Corporight\Claude\Corporight CRM 1.0" && git add my-app/src/lib/finance/actions.ts && git commit -m "feat: add finance read functions and order economics"
```

---

## Task 10: Typecheck and lint

- [ ] **Step 1: Full typecheck**

```bash
cd my-app && npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 2: Lint**

```bash
cd my-app && npx eslint src/lib/finance/ src/db/schema/finance.ts 2>&1
```

Expected: 0 errors, 0 warnings (or only warnings — no errors).

- [ ] **Step 3: Fix any issues found before proceeding**

If typecheck or lint fails, fix the reported issues. Common issues and fixes:
- `string | undefined` not assignable to `string`: use `?? null` when inserting nullable columns
- Unused imports: remove them
- Type inference issues on SQL aggregations: add explicit `sql<string>` or `sql<number>` type parameters

---

## Task 11: Smoke test

**Files:**
- Create: `my-app/scripts/smoke-finance.ts`

- [ ] **Step 1: Create `scripts/smoke-finance.ts`**

```typescript
/**
 * Smoke test — Finance module (Phase 1)
 * Run: DATABASE_URL=... npx tsx scripts/smoke-finance.ts
 *
 * Scenarios:
 *   1. Order lifecycle: UNPAID → PARTIALLY_PAID → PAID
 *   2. OVERPAID order (second allocation exceeds order total)
 *   3. Expense movement affecting getOrderEconomics actual profit
 *   4. Allocation cancellation: status reverts, payment group recalculates
 *   5. Guard: allocation exceeding payment group total is rejected
 *   6. Guard: allocation against non-INCOME payment group is rejected
 */

import postgres from 'postgres'

// ── Stable fixture IDs ─────────────────────────────────────────────
const CLIENT_ID  = 'df4c2a11-1111-4000-a000-000000000001'
const ORDER_ID   = 'df4c2a11-2222-4000-a000-000000000002'

// ── Helpers ───────────────────────────────────────────────────────

function section(title: string) {
  console.log('\n' + '═'.repeat(60))
  console.log(`  ${title}`)
  console.log('═'.repeat(60))
}

function step(label: string) { console.log(`\n── ${label}`) }
function log(label: string, value: unknown) {
  console.log(`${label}:`, JSON.stringify(value, null, 2))
}

let failed = false
function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓  ${label}`)
  } else {
    console.error(`  ✗  FAIL: ${label}`)
    failed = true
  }
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) throw new Error('DATABASE_URL not set')
  process.env.DATABASE_URL = DATABASE_URL

  const sql = postgres(DATABASE_URL)

  const {
    createCenter,
    createFinancialTreeCategory,
    createFinancialTreeType,
    createFinancialTreeDetail,
    createPaymentGroup,
    createFinancialMovement,
    createPaymentAllocation,
    cancelPaymentAllocation,
    listAllocationsForOrder,
    getOrderPaymentStatus,
    getOrderEconomics,
  } = await import('../src/lib/finance/actions.js')

  // ── Step 0: Clean up + Prerequisites ──────────────────────────────

  section('STEP 0 — Clean up + Prerequisites')

  // Clean up any leftover finance rows from previous runs.
  await sql`DELETE FROM payment_allocations WHERE order_id = ${ORDER_ID}`
  await sql`DELETE FROM financial_movements WHERE order_id = ${ORDER_ID}`
  await sql`DELETE FROM payment_groups WHERE bank_reference = 'SMOKE-TEST-PG'`
  await sql`DELETE FROM order_items WHERE order_id = ${ORDER_ID}`
  await sql`DELETE FROM orders WHERE id = ${ORDER_ID}`
  await sql`DELETE FROM subjects WHERE id = ${CLIENT_ID}`
  console.log('  cleaned up prior rows')

  // Insert client subject.
  await sql`
    INSERT INTO subjects (id, type, display_name, is_active)
    VALUES (${CLIENT_ID}, 'PERSON', 'Finance Test Client', true)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, is_active = true
  `
  console.log('  client subject ready')

  // Insert order directly (bypassing action to avoid AML).
  await sql`
    INSERT INTO orders (id, number, order_type, status, client_subject_id)
    VALUES (${ORDER_ID}, 'ORD-SMOKE-FIN-001', 'OTHER', 'CONCEPT', ${CLIENT_ID})
    ON CONFLICT (id) DO NOTHING
  `

  // Insert two order items totalling 10000.00.
  await sql`
    INSERT INTO order_items (order_id, item_type, description, quantity, unit_price, total_price)
    VALUES
      (${ORDER_ID}, 'SERVICE', 'Company formation fee',   1, '8000.00', '8000.00'),
      (${ORDER_ID}, 'SERVICE', 'Registered address year', 1, '2000.00', '2000.00')
  `
  console.log('  order + items ready (total: 10000.00)')

  // ── Step 1: Create financial tree ──────────────────────────────────

  section('STEP 1 — Create financial tree (center + category + type + detail)')

  const centerResult = await createCenter({
    code: 'SMOKE-MAIN',
    name: 'Smoke Test Main Center',
    vatMode: 'NO_VAT',
  })
  log('createCenter', centerResult)
  if (!centerResult.success) { console.error('FATAL', centerResult.error); process.exit(1) }
  const CENTER_ID = centerResult.data.id

  const catResult = await createFinancialTreeCategory({
    code: 'SMOKE-INCOME',
    name: 'Smoke Income',
    direction: 'INCOME',
  })
  log('createFinancialTreeCategory (INCOME)', catResult)
  if (!catResult.success) { console.error('FATAL', catResult.error); process.exit(1) }
  const CAT_INCOME_ID = catResult.data.id

  const catExpResult = await createFinancialTreeCategory({
    code: 'SMOKE-EXPENSE',
    name: 'Smoke Expense',
    direction: 'EXPENSE',
  })
  log('createFinancialTreeCategory (EXPENSE)', catExpResult)
  if (!catExpResult.success) { console.error('FATAL', catExpResult.error); process.exit(1) }
  const CAT_EXPENSE_ID = catExpResult.data.id

  const typeResult = await createFinancialTreeType({
    code: 'SMOKE-SVC-INCOME',
    name: 'Smoke Service Income',
    categoryId: CAT_INCOME_ID,
  })
  log('createFinancialTreeType (INCOME)', typeResult)
  if (!typeResult.success) { console.error('FATAL', typeResult.error); process.exit(1) }
  const TYPE_INCOME_ID = typeResult.data.id

  const typeExpResult = await createFinancialTreeType({
    code: 'SMOKE-SVC-EXPENSE',
    name: 'Smoke Service Expense',
    categoryId: CAT_EXPENSE_ID,
  })
  log('createFinancialTreeType (EXPENSE)', typeExpResult)
  if (!typeExpResult.success) { console.error('FATAL', typeExpResult.error); process.exit(1) }
  const TYPE_EXPENSE_ID = typeExpResult.data.id

  const detailResult = await createFinancialTreeDetail({
    code: 'SMOKE-DETAIL-INCOME',
    name: 'Smoke Detail Income',
    typeId: TYPE_INCOME_ID,
  })
  log('createFinancialTreeDetail (INCOME)', detailResult)
  if (!detailResult.success) { console.error('FATAL', detailResult.error); process.exit(1) }
  const DETAIL_INCOME_ID = detailResult.data.id

  const detailExpResult = await createFinancialTreeDetail({
    code: 'SMOKE-DETAIL-EXPENSE',
    name: 'Smoke Detail Expense',
    typeId: TYPE_EXPENSE_ID,
  })
  log('createFinancialTreeDetail (EXPENSE)', detailExpResult)
  if (!detailExpResult.success) { console.error('FATAL', detailExpResult.error); process.exit(1) }
  const DETAIL_EXPENSE_ID = detailExpResult.data.id

  // ── Step 2: Create payment groups ─────────────────────────────────

  section('STEP 2 — Create payment groups')

  const pgIncomeResult = await createPaymentGroup({
    centerId: CENTER_ID,
    direction: 'INCOME',
    totalAmount: '15000.00',
    transactionDate: '2026-04-15',
    bankReference: 'SMOKE-TEST-PG',
    note: 'Smoke test income group',
  })
  log('createPaymentGroup (INCOME)', pgIncomeResult)
  if (!pgIncomeResult.success) { console.error('FATAL', pgIncomeResult.error); process.exit(1) }
  const PG_INCOME_ID = pgIncomeResult.data.id

  const pgExpenseResult = await createPaymentGroup({
    centerId: CENTER_ID,
    direction: 'EXPENSE',
    totalAmount: '1000.00',
    transactionDate: '2026-04-15',
    bankReference: 'SMOKE-TEST-PG',
    note: 'Smoke test expense group',
  })
  log('createPaymentGroup (EXPENSE)', pgExpenseResult)
  if (!pgExpenseResult.success) { console.error('FATAL', pgExpenseResult.error); process.exit(1) }
  const PG_EXPENSE_ID = pgExpenseResult.data.id

  // ── Step 3: Order starts UNPAID ────────────────────────────────────

  section('STEP 3 — Verify order starts UNPAID')

  const statusUnpaid = await getOrderPaymentStatus(ORDER_ID)
  log('getOrderPaymentStatus (initial)', statusUnpaid)

  // ── Step 4: Partial allocation → PARTIALLY_PAID ───────────────────

  section('STEP 4 — Partial allocation → PARTIALLY_PAID')

  const alloc1Result = await createPaymentAllocation({
    paymentGroupId: PG_INCOME_ID,
    orderId: ORDER_ID,
    allocatedAmount: '6000.00',
    note: 'First partial payment',
  })
  log('createPaymentAllocation (6000)', alloc1Result)
  if (!alloc1Result.success) { console.error('FATAL', alloc1Result.error); process.exit(1) }
  const ALLOC_1_ID = alloc1Result.data.id

  const statusPartial = await getOrderPaymentStatus(ORDER_ID)
  log('getOrderPaymentStatus (after 6000)', statusPartial)

  // ── Step 5: Full allocation → PAID ────────────────────────────────

  section('STEP 5 — Second allocation → PAID')

  const alloc2Result = await createPaymentAllocation({
    paymentGroupId: PG_INCOME_ID,
    orderId: ORDER_ID,
    allocatedAmount: '4000.00',
    note: 'Second payment completes the order',
  })
  log('createPaymentAllocation (4000)', alloc2Result)
  if (!alloc2Result.success) { console.error('FATAL', alloc2Result.error); process.exit(1) }
  const ALLOC_2_ID = alloc2Result.data.id

  const statusPaid = await getOrderPaymentStatus(ORDER_ID)
  log('getOrderPaymentStatus (after 10000)', statusPaid)

  // ── Step 6: Extra allocation → OVERPAID ───────────────────────────

  section('STEP 6 — Extra allocation → OVERPAID')

  const alloc3Result = await createPaymentAllocation({
    paymentGroupId: PG_INCOME_ID,
    orderId: ORDER_ID,
    allocatedAmount: '500.00',
    note: 'Overpayment',
  })
  log('createPaymentAllocation (500 extra)', alloc3Result)
  if (!alloc3Result.success) { console.error('FATAL', alloc3Result.error); process.exit(1) }
  const ALLOC_3_ID = alloc3Result.data.id

  const statusOverpaid = await getOrderPaymentStatus(ORDER_ID)
  log('getOrderPaymentStatus (after 10500)', statusOverpaid)

  // ── Step 7: Expense movement → actual profit ───────────────────────

  section('STEP 7 — Expense movement → getOrderEconomics')

  const expMovResult = await createFinancialMovement({
    centerId: CENTER_ID,
    orderId: ORDER_ID,
    direction: 'EXPENSE',
    amountGross: '1200.00',
    amountNet: '1200.00',
    vatAmount: '0',
    vatMode: 'NO_VAT',
    categoryId: CAT_EXPENSE_ID,
    typeId: TYPE_EXPENSE_ID,
    detailId: DETAIL_EXPENSE_ID,
    description: 'State fee for company formation',
    movementDate: '2026-04-15',
  })
  log('createFinancialMovement (EXPENSE 1200)', expMovResult)
  if (!expMovResult.success) { console.error('FATAL', expMovResult.error); process.exit(1) }

  const economicsResult = await getOrderEconomics(ORDER_ID)
  log('getOrderEconomics', economicsResult)

  // ── Step 8: Cancel one allocation → PARTIALLY_PAID ────────────────

  section('STEP 8 — Cancel overpayment allocation → back to PAID')

  const cancelResult = await cancelPaymentAllocation({
    paymentAllocationId: ALLOC_3_ID,
  })
  log('cancelPaymentAllocation (alloc3)', cancelResult)
  if (!cancelResult.success) { console.error('FATAL', cancelResult.error); process.exit(1) }

  const statusAfterCancel = await getOrderPaymentStatus(ORDER_ID)
  log('getOrderPaymentStatus (after cancel)', statusAfterCancel)

  // ── Step 9: Now cancel alloc2 → PARTIALLY_PAID ────────────────────

  section('STEP 9 — Cancel second allocation → PARTIALLY_PAID')

  const cancel2Result = await cancelPaymentAllocation({
    paymentAllocationId: ALLOC_2_ID,
  })
  log('cancelPaymentAllocation (alloc2)', cancel2Result)
  if (!cancel2Result.success) { console.error('FATAL', cancel2Result.error); process.exit(1) }

  const statusPartialAgain = await getOrderPaymentStatus(ORDER_ID)
  log('getOrderPaymentStatus (after cancel2)', statusPartialAgain)

  // ── Step 10: Guard — allocation exceeds PG total ──────────────────

  section('STEP 10 — Guard: allocation exceeds payment group total')

  // PG_INCOME_ID has totalAmount=15000, current allocated=6000 (alloc1 remains ACTIVE).
  // Trying to allocate 9001 should exceed remaining capacity (9000).
  const overLimitResult = await createPaymentAllocation({
    paymentGroupId: PG_INCOME_ID,
    orderId: ORDER_ID,
    allocatedAmount: '9001.00',
  })
  log('Allocation over PG limit (expect failure)', overLimitResult)

  // ── Step 11: Guard — non-INCOME payment group ─────────────────────

  section('STEP 11 — Guard: allocation against EXPENSE payment group rejected')

  const nonIncomeAllocResult = await createPaymentAllocation({
    paymentGroupId: PG_EXPENSE_ID,
    orderId: ORDER_ID,
    allocatedAmount: '500.00',
  })
  log('Allocation on EXPENSE group (expect failure)', nonIncomeAllocResult)

  // ── DB Verification ────────────────────────────────────────────────

  section('DB VERIFICATION — payment_groups final state')
  const pgRows = await sql`SELECT id, direction, total_amount, allocated_amount, processing_status FROM payment_groups WHERE bank_reference = 'SMOKE-TEST-PG' ORDER BY created_at`
  log('payment_groups', pgRows)

  section('DB VERIFICATION — allocations for order')
  const allocRows = await sql`SELECT id, allocated_amount, status FROM payment_allocations WHERE order_id = ${ORDER_ID} ORDER BY created_at`
  log('payment_allocations', allocRows)

  section('DB VERIFICATION — audit_log for order (payment status changes)')
  const auditRows = await sql`SELECT action, diff, created_at FROM audit_log WHERE entity_id = ${ORDER_ID} AND action = 'ORDER_PAYMENT_STATUS_CHANGED' ORDER BY created_at`
  log('audit_log ORDER_PAYMENT_STATUS_CHANGED', auditRows)

  // ── Assertions ─────────────────────────────────────────────────────

  section('ASSERTIONS')

  // Initial state
  assert('Initial order status is UNPAID',
    statusUnpaid.success === true && (statusUnpaid as any).data.status === 'UNPAID')
  assert('Initial order total is 10000.00',
    statusUnpaid.success === true && (statusUnpaid as any).data.orderTotal === '10000.00')

  // After partial allocation (6000)
  assert('After 6000: status is PARTIALLY_PAID',
    statusPartial.success === true && (statusPartial as any).data.status === 'PARTIALLY_PAID')
  assert('After 6000: allocatedAmount is 6000.00',
    statusPartial.success === true && (statusPartial as any).data.allocatedAmount === '6000.00')

  // After full allocation (10000)
  assert('After 10000: status is PAID',
    statusPaid.success === true && (statusPaid as any).data.status === 'PAID')

  // After overpayment (10500)
  assert('After 10500: status is OVERPAID',
    statusOverpaid.success === true && (statusOverpaid as any).data.status === 'OVERPAID')

  // Expense + economics
  assert('getOrderEconomics succeeded', economicsResult.success === true)
  if (economicsResult.success) {
    assert('Economics: allocatedPayments = 10500.00',
      (economicsResult as any).data.allocatedPayments === '10500.00')
    assert('Economics: expenseTotal = 1200.00',
      (economicsResult as any).data.expenseTotal === '1200.00')
    assert('Economics: actualProfit = 9300.00',
      (economicsResult as any).data.actualProfit === '9300.00')
    assert('Economics: paymentStatus = OVERPAID',
      (economicsResult as any).data.paymentStatus === 'OVERPAID')
  }

  // After cancelling alloc3 (500)
  assert('After cancel overpayment: status is PAID',
    statusAfterCancel.success === true && (statusAfterCancel as any).data.status === 'PAID')

  // After cancelling alloc2 (4000)
  assert('After cancel alloc2: status is PARTIALLY_PAID',
    statusPartialAgain.success === true && (statusPartialAgain as any).data.status === 'PARTIALLY_PAID')

  // Double cancel guard
  const doubleCancel = await cancelPaymentAllocation({ paymentAllocationId: ALLOC_3_ID })
  assert('Double cancel rejected (success=false)', doubleCancel.success === false)
  assert('Double cancel error mentions CANCELLED',
    typeof (doubleCancel as any).error === 'string' &&
    (doubleCancel as any).error.includes('CANCELLED'))

  // Guard: over-limit
  assert('Over-limit allocation rejected', overLimitResult.success === false)
  assert('Over-limit error mentions capacity or exceed',
    typeof (overLimitResult as any).error === 'string' &&
    ((overLimitResult as any).error.includes('exceed') ||
     (overLimitResult as any).error.includes('capacity')))

  // Guard: non-INCOME
  assert('Non-INCOME allocation rejected', nonIncomeAllocResult.success === false)
  assert('Non-INCOME error mentions direction or INCOME',
    typeof (nonIncomeAllocResult as any).error === 'string' &&
    (nonIncomeAllocResult as any).error.includes('INCOME'))

  // Payment group state
  const incomeGroup = pgRows.find((r: any) => r.direction === 'INCOME')
  assert('PG INCOME: processing_status = PARTIALLY_ALLOCATED',
    incomeGroup?.processing_status === 'PARTIALLY_ALLOCATED')
  assert('PG INCOME: allocated_amount = 6000.00',
    incomeGroup?.allocated_amount === '6000.00')

  // Audit log: at least 3 ORDER_PAYMENT_STATUS_CHANGED entries
  assert('audit_log: ≥3 ORDER_PAYMENT_STATUS_CHANGED rows',
    auditRows.length >= 3)

  // ── Final result ────────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(60))
  if (failed) {
    console.error('  RESULT: SOME ASSERTIONS FAILED')
  } else {
    console.log('  RESULT: ALL ASSERTIONS PASSED ✓')
  }
  console.log('═'.repeat(60) + '\n')

  await sql.end()
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Run smoke test**

```bash
cd my-app && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/corporight_crm npx tsx scripts/smoke-finance.ts 2>&1
```

Expected: `RESULT: ALL ASSERTIONS PASSED ✓`

If any assertion fails, diagnose using the logged output above the ASSERTIONS section. Common issues:
- `order total is 10000.00` fails: check order_items were inserted (Step 0)
- `allocatedAmount` precision mismatch: PostgreSQL may return `6000` not `6000.00` from SUM — if so, adjust assertion to use `parseFloat`
- `processing_status` assertion fails: check `recalculatePaymentGroupAllocationState` is being called correctly
- Audit count fails: check that the `ORDER_PAYMENT_STATUS_CHANGED` entries use `entity_id = orderId`, not allocation ID

- [ ] **Step 3: Commit**

```bash
cd "C:\Corporight\Claude\Corporight CRM 1.0" && git add my-app/scripts/smoke-finance.ts && git commit -m "test: add Phase 1 finance smoke test"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| centers table | Task 1, Task 5 |
| financial_tree_categories/types/details | Task 1, Task 5 |
| payment_groups | Task 1, Task 6 |
| financial_movements | Task 1, Task 7 |
| payment_allocations (soft-cancel) | Task 1, Task 8 |
| createPaymentGroup | Task 6 |
| createFinancialMovement | Task 7 |
| createPaymentAllocation | Task 8 |
| cancelPaymentAllocation | Task 8 |
| listPaymentGroups | Task 9 |
| listFinancialMovements | Task 9 |
| listAllocationsForOrder | Task 9 |
| getOrderPaymentStatus (computed) | Task 9 |
| getOrderEconomics | Task 9 |
| recalculatePaymentGroupAllocationState | Task 4 |
| recalculateOrderPaymentStatus | Task 4 |
| payment status: UNPAID/PARTIALLY_PAID/PAID/OVERPAID | Task 4, Task 9 |
| SELECT FOR UPDATE concurrency | Task 8 |
| Audit: PAYMENT_GROUP_CREATED | Task 6 |
| Audit: FINANCIAL_MOVEMENT_CREATED | Task 7 |
| Audit: PAYMENT_ALLOCATION_CREATED | Task 8 |
| Audit: PAYMENT_ALLOCATION_CANCELLED | Task 8 |
| Audit: ORDER_PAYMENT_STATUS_CHANGED (with full payload) | Task 8 |
| direction consistency (movement must match PG) | Task 7 |
| INCOME-only allocations | Task 8 |
| amount_gross = amount_net + vat_amount | Task 7 |
| NO_VAT → vat_amount = 0 | Task 7 |
| tree linkage integrity | Task 7 |
| Order total from live order_items (Phase 1) | Task 4, Task 9 |
| BANK_IMPORT rejected in Phase 1 | Task 3 (validator excludes it) |
| Smoke test: UNPAID→PARTIALLY_PAID→PAID | Task 11 |
| Smoke test: OVERPAID | Task 11 |
| Smoke test: expense → actual profit | Task 11 |
| Smoke test: allocation cancellation | Task 11 |
| Smoke test: PG over-limit guard | Task 11 |
| Smoke test: non-INCOME guard | Task 11 |

No gaps found.

**Placeholder scan:** No TBDs, TODOs, or "similar to Task N" patterns. All code steps are complete.

**Type consistency check:** All types, function names, and column names are consistent across all 11 tasks. `PaymentStatus` is defined once in `helpers.ts` and imported in `actions.ts`. `Tx` is defined once in `helpers.ts` and used in all three helpers.
