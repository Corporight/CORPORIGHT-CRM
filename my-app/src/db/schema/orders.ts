// orders.ts — Orders module (central aggregate)
//
// Invariants (CLAUDE.md):
//   - orders are the central aggregate; all business processes connect through them
//   - order_items are immutable once orders.confirmed_at is set (enforced at app layer)
//   - client_subject_id is a DENORMALIZED CACHE — not authoritative
//   - authoritative participant list lives in order_participants
//   - order_participants: exactly one of subject_id OR future_subject_id must be non-null
//   - future_subjects rows are never deleted; resolution fills resolved_subject_id
//   - order_change_actions.resulting_relation_id is a FK to relations.id,
//     filled when an action is applied and produces a relation
//
// updated_at convention (same as subjects module):
//   Not auto-maintained by PostgreSQL. Every UPDATE must explicitly set updatedAt: new Date().
//
// User FK convention:
//   All references to users.id use onDelete: 'set null'.

import {
  pgTable,
  uuid,
  text,
  boolean,
  date,
  timestamp,
  numeric,
  jsonb,
  check,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './shared'
import { subjects } from './subjects'
// Relations module is now implemented — enables the FK on resulting_relation_id below.
import { relations as relationsTable } from './relations'
// CompaniesForSale module — enables the FK on company_for_sale_id below.
import { companiesForSale } from './companies-for-sale'

// ── Controlled vocabularies ────────────────────────────────────────
// Kept as plain string constants, not PG ENUMs, so new values require
// only a code change + CHECK constraint update, not ALTER TYPE.

export const ORDER_TYPES = [
  'COMPANY_FORMATION',
  'COMPANY_CHANGE',
  'SHELF_PURCHASE',
  'VAT_REGISTRATION',
  'REGISTERED_OFFICE',
  'ACCOUNTING',
  'OTHER',
] as const
export type OrderType = (typeof ORDER_TYPES)[number]

export const ORDER_STATUSES = [
  'CONCEPT',
  'WAITING_FOR_PAYMENT',
  'DOCUMENT_PREPARATION',
  'WAITING_FOR_DOCUMENTS',
  'EXECUTION',
  'COMPLETED',
  'CANCELLED',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const CHANGE_ACTION_TYPES = [
  'DIRECTOR_APPOINTMENT',
  'DIRECTOR_REMOVAL',
  'SHARE_TRANSFER',
  'ADDRESS_CHANGE',
  'NAME_CHANGE',
  'STATUTORY_REP_CHANGE',
  'CAPITAL_CHANGE',
  'OTHER',
] as const
export type ChangeActionType = (typeof CHANGE_ACTION_TYPES)[number]

export const CHANGE_ACTION_STATUSES = ['PENDING', 'APPLIED', 'CANCELLED'] as const
export type ChangeActionStatus = (typeof CHANGE_ACTION_STATUSES)[number]

// ── orders ─────────────────────────────────────────────────────────
// Central aggregate. All business processes connect here.
//
// State machine: CONCEPT → WAITING_FOR_PAYMENT → DOCUMENT_PREPARATION
//                → WAITING_FOR_DOCUMENTS → EXECUTION → COMPLETED | CANCELLED
// Status transitions must be controlled at application level — no arbitrary updates.
// Direct status writes bypassing transition logic are not permitted.
//
// payment_status is intentionally NOT a column — it is computed from
// payment_allocations (sum of allocated amounts vs. order total).
// Never add a payment_status column here.
//
// client_subject_id is a denormalized read cache only.
// The authoritative client is: SELECT * FROM order_participants WHERE role_code = 'CLIENT'.
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // Globally unique human-readable reference, e.g. ORD-2026-0001.
    // Format: ORD-{YYYY}-{NNNN} (zero-padded sequential within year).
    // Generated in application code inside a transaction — see generateOrderNumber().
    // Must remain unique across all orders at all times.
    number: text('number').notNull().unique(),
    orderType: text('order_type').notNull(),
    status: text('status').notNull().default('CONCEPT'),
    // Denormalized cache — not the authoritative client reference.
    // Authoritative: order_participants WHERE role_code = 'CLIENT'.
    clientSubjectId: uuid('client_subject_id').references(() => subjects.id, {
      onDelete: 'set null',
    }),
    // For SHELF_PURCHASE orders: the company-for-sale record this order is executing.
    // Null for all other order types. Set when the order is created; reservation is
    // a separate explicit step via reserveCompanyForSale().
    // Phase 2: consider adding a CHECK(company_for_sale_id IS NULL OR order_type = 'SHELF_PURCHASE').
    companyForSaleId: uuid('company_for_sale_id').references(() => companiesForSale.id, {
      onDelete: 'set null',
    }),
    // Frozen business config at confirmation time. Populated as {} in Phase 1.
    // Phase 2 will populate this with a full snapshot on confirmed_at.
    snapshot: jsonb('snapshot').notNull().default(sql`'{}'::jsonb`),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    dueDate: date('due_date'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // updatedAt: must be set explicitly on every UPDATE — not auto-maintained by DB.
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    check('orders_type_check', sql`${table.orderType} IN (${sql.raw(ORDER_TYPES.map((t) => `'${t}'`).join(', '))})`),
    check('orders_status_check', sql`${table.status} IN (${sql.raw(ORDER_STATUSES.map((s) => `'${s}'`).join(', '))})`),
    index('idx_orders_status').on(table.status),
    index('idx_orders_client').on(table.clientSubjectId),
  ],
)

// ── order_items ─────────────────────────────────────────────────────
// INVARIANT: rows are immutable once parent orders.confirmed_at is set.
// Enforcement is at the application layer — see actions.ts.
// Phase 1: flat unit_price/total_price only. VAT breakdown deferred to Phase 2.
export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  itemType: text('item_type').notNull(),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  totalPrice: numeric('total_price', { precision: 12, scale: 2 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // updatedAt: must be set explicitly on every UPDATE — not auto-maintained by DB.
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
})

// ── future_subjects ────────────────────────────────────────────────
// Entities not yet legally created, referenced in orders before they exist.
// INVARIANT: rows are never deleted.
// When the subject is created, resolved_subject_id and resolved_at are filled.
export const futureSubjects = pgTable(
  'future_subjects',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    intendedType: text('intended_type').notNull(), // 'PERSON' | 'COMPANY'
    intendedName: text('intended_name'),
    legalForm: text('legal_form'),
    notes: text('notes'),
    // Filled on resolution — never on creation.
    resolvedSubjectId: uuid('resolved_subject_id').references(() => subjects.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // updatedAt: must be set explicitly on every UPDATE — not auto-maintained by DB.
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    check(
      'future_subjects_type_check',
      sql`${table.intendedType} IN ('PERSON', 'COMPANY')`,
    ),
  ],
)

// ── order_participants ─────────────────────────────────────────────
// Subjects (real or future) in a specific role within a specific order.
// DISTINCT from Relations — this is transactional context, not a legal record.
//
// CRITICAL INVARIANT: exactly one of subject_id OR future_subject_id must be non-null.
// Enforced by CHECK constraint at DB level.
//
// role_code: plain TEXT in Phase 1. Phase 2 will add FK → role_definitions.code.
export const orderParticipants = pgTable(
  'order_participants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // Exactly one of these two must be non-null (enforced by CHECK below).
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'restrict' }),
    futureSubjectId: uuid('future_subject_id').references(() => futureSubjects.id, {
      onDelete: 'restrict',
    }),
    // Phase 1: free text. Phase 2: FK → role_definitions.code
    roleCode: text('role_code').notNull(),
    sharePercentage: numeric('share_percentage', { precision: 5, scale: 2 }),
    // Business context within this order — why this participant is here.
    // e.g. STANDARD | APPOINTED | REMOVED | TRANSFEROR | ACQUIRER | SIGNER
    participantContextType: text('participant_context_type'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // updatedAt: must be set explicitly on every UPDATE — not auto-maintained by DB.
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    // INVARIANT: exactly one of subject_id / future_subject_id must be set.
    check(
      'order_participants_subject_xor',
      sql`(${table.subjectId} IS NOT NULL AND ${table.futureSubjectId} IS NULL)
        OR (${table.subjectId} IS NULL AND ${table.futureSubjectId} IS NOT NULL)`,
    ),
    index('idx_order_participants_order').on(table.orderId),
    index('idx_order_participants_subject').on(table.subjectId),
  ],
)

// ── order_change_actions ───────────────────────────────────────────
// Required foundation entity for COMPANY_CHANGE and SHELF_PURCHASE orders.
// Describes a concrete legal mutation intended by the order.
//
// old_value / new_value: JSONB snapshots of the state before and after.
// share_percentage: canonical source for the transferred ownership share on
//   SHARE_TRANSFER actions. Must be set by the operator before order completion.
// resulting_relation_id: FK → relations.id, filled when the action is applied
//   and a relation is created or terminated as a result.
export const orderChangeActions = pgTable(
  'order_change_actions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    actionType: text('action_type').notNull(),
    targetSubjectId: uuid('target_subject_id').references(() => subjects.id, {
      onDelete: 'set null',
    }),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    // Canonical transferred share amount for SHARE_TRANSFER actions.
    // Validated at apply time: must be present and in range [0, 100].
    sharePercentage: numeric('share_percentage', { precision: 5, scale: 2 }),
    status: text('status').notNull().default('PENDING'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    // FK to relations.id — now that the Relations module is implemented.
    // set null on delete: cancelling/reversing a relation does not erase the action record.
    resultingRelationId: uuid('resulting_relation_id').references(() => relationsTable.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // updatedAt: must be set explicitly on every UPDATE — not auto-maintained by DB.
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    check(
      'order_change_actions_type_check',
      sql`${table.actionType} IN (${sql.raw(CHANGE_ACTION_TYPES.map((t) => `'${t}'`).join(', '))})`,
    ),
    check(
      'order_change_actions_status_check',
      sql`${table.status} IN (${sql.raw(CHANGE_ACTION_STATUSES.map((s) => `'${s}'`).join(', '))})`,
    ),
    check(
      'order_change_actions_share_percentage_range',
      sql`${table.sharePercentage} IS NULL OR (${table.sharePercentage} >= 0 AND ${table.sharePercentage} <= 100)`,
    ),
    index('idx_order_change_actions_order').on(table.orderId),
  ],
)

// ── TypeScript types ───────────────────────────────────────────────
export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type OrderItem = typeof orderItems.$inferSelect
export type FutureSubject = typeof futureSubjects.$inferSelect
export type OrderParticipant = typeof orderParticipants.$inferSelect
export type OrderChangeAction = typeof orderChangeActions.$inferSelect
