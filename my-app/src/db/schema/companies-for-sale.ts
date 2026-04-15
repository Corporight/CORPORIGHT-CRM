// companies-for-sale.ts — Inventory of ready-made (shelf) companies available for purchase
//
// Design principles:
//   - A company is listed for sale by creating a row pointing to its subject.
//   - Status is the authoritative state machine — see state machine comment below.
//   - Only one active (non-SOLD, non-WITHDRAWN) listing per subject at a time.
//     Enforced by partial unique index on subject_id where status is not terminal.
//   - Reservation, sale, and withdrawal are all explicit operator actions — never automatic.
//   - basePrice records the original asking price at listing time and is immutable.
//     currentPrice is the operative price and may be adjusted after listing.
//   - reservedByOrderId is a plain UUID — no FK to orders. Reason: companies-for-sale.ts
//     would need to import orders.ts to define the FK, but orders.ts already imports
//     companies-for-sale.ts (for the companyForSaleId column). Adding the reverse import
//     creates a circular schema dependency. Referential integrity for this column is soft.
//     To look up a listing from an order, use orders.company_for_sale_id (has FK).
//   - updatedAt is not auto-maintained by PostgreSQL; must be set explicitly on every UPDATE.
//
// ── State machine ──────────────────────────────────────────────────
//   FOR_SALE  → RESERVED   (reserveCompanyForSale)
//   FOR_SALE  → WITHDRAWN  (withdrawCompanyForSale)
//   RESERVED  → FOR_SALE   (releaseCompanyForSaleReservation)
//   RESERVED  → SOLD       (markCompanyForSaleSold)
//   RESERVED  → WITHDRAWN  (withdrawCompanyForSale)
//   SOLD      → (terminal)
//   WITHDRAWN → (terminal)

import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './shared'
import { subjects } from './subjects'

// ── Controlled vocabularies ────────────────────────────────────────

export const COMPANY_FOR_SALE_STATUSES = [
  'FOR_SALE',
  'RESERVED',
  'SOLD',
  'WITHDRAWN',
] as const
export type CompanyForSaleStatus = (typeof COMPANY_FOR_SALE_STATUSES)[number]

export const COMPANY_FOR_SALE_SOURCE_TYPES = ['INTERNAL', 'EXTERNAL'] as const
export type CompanyForSaleSourceType = (typeof COMPANY_FOR_SALE_SOURCE_TYPES)[number]

// ── companies_for_sale ─────────────────────────────────────────────

export const companiesForSale = pgTable(
  'companies_for_sale',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // The company subject being offered for sale.
    // onDelete: 'restrict' — a subject cannot be removed while listed.
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('FOR_SALE'),
    sourceType: text('source_type').notNull(),
    // Original asking price — set at creation, never updated.
    basePrice: numeric('base_price', { precision: 12, scale: 2 }).notNull(),
    // Operative price — may be adjusted after listing.
    currentPrice: numeric('current_price', { precision: 12, scale: 2 }).notNull(),
    // Plain UUID — no FK constraint. See module-level design note above.
    reservedByOrderId: uuid('reserved_by_order_id'),
    reservedAt: timestamp('reserved_at', { withTimezone: true }),
    soldAt: timestamp('sold_at', { withTimezone: true }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // updatedAt: must be set explicitly on every UPDATE — not auto-maintained by DB.
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    check(
      'companies_for_sale_status_check',
      sql`${table.status} IN (${sql.raw(COMPANY_FOR_SALE_STATUSES.map((s) => `'${s}'`).join(', '))})`,
    ),
    check(
      'companies_for_sale_source_type_check',
      sql`${table.sourceType} IN (${sql.raw(COMPANY_FOR_SALE_SOURCE_TYPES.map((s) => `'${s}'`).join(', '))})`,
    ),
    // A subject may have at most one active (non-terminal) listing at a time.
    // SOLD and WITHDRAWN are terminal — historical rows are permitted to coexist.
    uniqueIndex('uq_companies_for_sale_subject_active')
      .on(table.subjectId)
      .where(sql`status NOT IN ('SOLD', 'WITHDRAWN')`),
    index('idx_companies_for_sale_status').on(table.status),
    index('idx_companies_for_sale_subject').on(table.subjectId),
  ],
)

// ── TypeScript types ───────────────────────────────────────────────
export type CompanyForSale = typeof companiesForSale.$inferSelect
export type NewCompanyForSale = typeof companiesForSale.$inferInsert
