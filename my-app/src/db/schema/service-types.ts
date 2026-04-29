// service-types.ts — Canonical service catalog
//
// Single source of truth for all services offered. Consumed by Orders (item selection)
// and Finance (default income detail pre-selection).
//
// Key invariants:
//   - code is immutable after INSERT — used as FK target in future order_items
//   - financial_tree_detail_id is nullable: populated only where one unambiguous
//     income detail exists; left NULL for multi-context services (set at movement entry)
//   - long_term_service_type_id has no FK — long_term_service_types table is Phase 2
//   - allowed_primary_service_codes: non-null only for SUPPLEMENTARY services;
//     null for PRIMARY and STANDALONE
//   - base_price = 0 where pricing calibration wave has not yet been run

import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  check,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { financialTreeDetails } from './finance'

// ── Controlled vocabularies ────────────────────────────────────────

export const SERVICE_CATEGORIES = ['PRIMARY', 'SUPPLEMENTARY', 'STANDALONE'] as const
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]

export const SERVICE_APPLICABLE_TO = ['COMPANY', 'PERSON', 'BOTH'] as const
export type ServiceApplicableTo = (typeof SERVICE_APPLICABLE_TO)[number]

// ── service_types ──────────────────────────────────────────────────
export const serviceTypes = pgTable(
  'service_types',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    serviceCategory: text('service_category').notNull(),
    applicableTo: text('applicable_to').notNull(),
    // Non-null only for SUPPLEMENTARY services. Lists which PRIMARY service codes
    // this supplementary may be attached to on a single order.
    allowedPrimaryServiceCodes: text('allowed_primary_service_codes').array(),
    basePrice: numeric('base_price', { precision: 12, scale: 2 }).notNull().default('0'),
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }).notNull().default('21'),
    sourceOfFundsThreshold: numeric('source_of_funds_threshold', { precision: 14, scale: 2 }),
    // Nullable FK — set only where one unambiguous income detail exists for this service.
    financialTreeDetailId: uuid('financial_tree_detail_id').references(
      () => financialTreeDetails.id,
      { onDelete: 'set null' },
    ),
    createsLongTermService: boolean('creates_long_term_service').notNull().default(false),
    // Phase 2: add FK → long_term_service_types.id once that table is created.
    longTermServiceTypeId: uuid('long_term_service_type_id'),
    requiresRecipient: boolean('requires_recipient').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'st_category_check',
      sql`${table.serviceCategory} IN (${sql.raw(SERVICE_CATEGORIES.map((c) => `'${c}'`).join(', '))})`,
    ),
    check(
      'st_applicable_to_check',
      sql`${table.applicableTo} IN (${sql.raw(SERVICE_APPLICABLE_TO.map((a) => `'${a}'`).join(', '))})`,
    ),
    check('st_base_price_check', sql`${table.basePrice} >= 0`),
    check('st_vat_rate_check', sql`${table.vatRate} >= 0 AND ${table.vatRate} <= 100`),
    index('idx_service_types_category').on(table.serviceCategory),
    index('idx_service_types_active').on(table.isActive),
  ],
)

// ── TypeScript types ───────────────────────────────────────────────
export type ServiceType = typeof serviceTypes.$inferSelect
export type NewServiceType = typeof serviceTypes.$inferInsert
