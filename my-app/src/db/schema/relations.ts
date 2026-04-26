// relations.ts — Legal and business relationships between subjects
//
// Design principles:
//   - Relations represent persistent legal structure, NOT order-level context
//     (order context lives in order_participants — a completely separate concept)
//   - Always between two existing subjects — future_subjects are not permitted here
//   - Self-links are not allowed (subject_a_id != subject_b_id), enforced by CHECK
//   - No polymorphic FK pairs — both sides are explicit FK columns to subjects
//   - Soft-delete only: isActive = false instead of row deletion
//   - updatedAt is not auto-maintained by PostgreSQL; must be set explicitly on every UPDATE
//   - All user FKs use onDelete: 'set null'
//   - Both subject FKs use onDelete: 'restrict' — a subject cannot be removed
//     while it participates in a relation
//
// ── Active-state rule ──────────────────────────────────────────────
// isActive is the AUTHORITATIVE flag for whether a relation is active.
// validTo is an optional informational field recording a known end date.
//
// A relation is considered active if and only if: isActive = true
// Canonical query filter: WHERE is_active = true
//
// When terminating a relation, ALWAYS do both:
//   1. Set isActive = false
//   2. Set validTo = termination timestamp (if a specific date applies)
// Never set one without the other — contradictory states are invalid:
//   - isActive = true  + validTo in the past  → INVALID (should have been deactivated)
//   - isActive = false + validTo = null        → VALID (explicitly deactivated, no end date recorded)
//
// Application code must enforce this pairing. No DB trigger in Phase 1.
// Phase 2 can add a trigger to auto-set isActive = false when validTo is reached.

import {
  pgTable,
  uuid,
  text,
  boolean,
  numeric,
  timestamp,
  jsonb,
  uniqueIndex,
  check,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './shared'
import { subjects } from './subjects'

// ── Controlled vocabulary ──────────────────────────────────────────
// Plain string constants — not PG ENUMs — so adding a new type requires
// only a code change + CHECK constraint update, not ALTER TYPE.

export const RELATION_TYPES = [
  'SHAREHOLDER',
  'DIRECTOR',
  'PROCURIST',
  'BENEFICIAL_OWNER',
  'REPRESENTATIVE',
] as const
export type RelationType = (typeof RELATION_TYPES)[number]

// ── Participant validation rules ───────────────────────────────────
// Defines the expected subject types for each side of a relation.
// Enforced at application layer — not in the DB schema.
// Use validateRelationParticipants() in action code before inserting.
//
// subjectA = the "acting" side (e.g. the person who is a director)
// subjectB = the "target" side (e.g. the company being directed)
//
// REPRESENTATIVE is intentionally open on both sides in Phase 1:
// a representative can be a person or company acting on behalf of
// another person or company. Restrict further if domain rules clarify.
export const RELATION_TYPE_RULES: Record<
  RelationType,
  { subjectA: ('PERSON' | 'COMPANY')[]; subjectB: ('PERSON' | 'COMPANY')[] }
> = {
  DIRECTOR:        { subjectA: ['PERSON'],           subjectB: ['COMPANY'] },
  PROCURIST:       { subjectA: ['PERSON'],           subjectB: ['COMPANY'] },
  SHAREHOLDER:     { subjectA: ['PERSON', 'COMPANY'], subjectB: ['COMPANY'] },
  BENEFICIAL_OWNER:{ subjectA: ['PERSON'],           subjectB: ['COMPANY'] },
  REPRESENTATIVE:  { subjectA: ['PERSON', 'COMPANY'], subjectB: ['PERSON', 'COMPANY'] },
}

// Validate that two subject types are permitted for a given relation type.
// Call this in action code before inserting a relation row.
// Returns null if valid, or an error message string if invalid.
export function validateRelationParticipants(
  relationType: RelationType,
  subjectAType: 'PERSON' | 'COMPANY',
  subjectBType: 'PERSON' | 'COMPANY',
): string | null {
  const rule = RELATION_TYPE_RULES[relationType]
  if (!rule.subjectA.includes(subjectAType)) {
    return `Relation type ${relationType} requires subject A to be one of: ${rule.subjectA.join(', ')}. Got: ${subjectAType}`
  }
  if (!rule.subjectB.includes(subjectBType)) {
    return `Relation type ${relationType} requires subject B to be one of: ${rule.subjectB.join(', ')}. Got: ${subjectBType}`
  }
  return null
}

// ── relations ──────────────────────────────────────────────────────
// Directional relationship from subject A toward subject B.
// Example: subject A (person) is DIRECTOR of subject B (company).
//
// isActive: authoritative soft-delete flag (see active-state rule above).
// validFrom / validTo: optional timestamps recording legal validity bounds.
//   validTo must be >= validFrom when both are set (enforced by CHECK).
// sharePercentage: ownership stake, applicable to SHAREHOLDER relations.
//   Must be in [0, 100] when present (enforced by CHECK).
// noteInternal: free-text internal note, not exposed to clients.
export const relations = pgTable(
  'relations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // The "acting" side of the relationship (e.g. the director, the shareholder).
    subjectAId: uuid('subject_a_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    // The "target" side of the relationship (e.g. the company being directed).
    subjectBId: uuid('subject_b_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    relationType: text('relation_type').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validTo: timestamp('valid_to', { withTimezone: true }),
    // Authoritative active flag. See active-state rule at top of file.
    isActive: boolean('is_active').notNull().default(true),
    sharePercentage: numeric('share_percentage', { precision: 5, scale: 2 }),
    noteInternal: text('note_internal'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // updatedAt: must be set explicitly on every UPDATE — not auto-maintained by DB.
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    // A subject cannot have a relation with itself.
    check('relations_no_self_link', sql`${table.subjectAId} != ${table.subjectBId}`),
    check(
      'relations_type_check',
      sql`${table.relationType} IN (${sql.raw(RELATION_TYPES.map((t) => `'${t}'`).join(', '))})`,
    ),
    // validTo must not precede validFrom. Nulls on either side are permitted.
    check(
      'relations_validity_range',
      sql`${table.validFrom} IS NULL OR ${table.validTo} IS NULL OR ${table.validTo} >= ${table.validFrom}`,
    ),
    // share_percentage must be between 0 and 100 when present.
    check(
      'relations_share_percentage_range',
      sql`${table.sharePercentage} IS NULL OR (${table.sharePercentage} >= 0 AND ${table.sharePercentage} <= 100)`,
    ),
    // Only one active relation of the same type between the same subject pair.
    // Historical (isActive=false) rows are excluded — enabling the append-only pattern.
    uniqueIndex('uq_active_relation')
      .on(table.subjectAId, table.subjectBId, table.relationType)
      .where(sql`${table.isActive} = true`),
    index('idx_relations_subject_a').on(table.subjectAId),
    index('idx_relations_subject_b').on(table.subjectBId),
    // relation_type is included in most filtering queries (e.g. "all directors of company X").
    index('idx_relations_type').on(table.relationType),
  ],
)

// ── relation_events ────────────────────────────────────────────────
// Immutable audit trail for every relation mutation.
// INSERT-only — never UPDATE or DELETE.
//
// eventType:
//   'CREATED'     — a new relation row was inserted
//   'TERMINATED'  — an existing relation was deactivated (isActive=false, validTo set)
//   'UPDATED'     — sharePercentage or noteInternal was changed on an active relation
//   'REACTIVATED' — a previously terminated relation was restored (isActive=true)
//
// triggeredByOrderId: plain UUID reference to the order that caused this change.
//   No FK constraint here — this keeps the relations module independent of
//   the orders module. Referential integrity is soft; look up via
//   order_change_actions.resulting_relation_id if needed.
//
// snapshot: point-in-time JSON copy of the relevant state at the moment of the event.
//   Immutable — do not update snapshot after insert.
export const RELATION_EVENT_TYPES = ['CREATED', 'TERMINATED', 'UPDATED', 'REACTIVATED'] as const
export type RelationEventType = (typeof RELATION_EVENT_TYPES)[number]

export const relationEvents = pgTable(
  'relation_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    relationId: uuid('relation_id')
      .notNull()
      .references(() => relations.id, { onDelete: 'restrict' }),
    eventType: text('event_type').notNull(),
    // Plain UUID — no FK constraint. Reason: adding a FK to orders.id would require
    // relations.ts to import orders.ts. But orders.ts already imports relations.ts
    // (for the resultingRelationId FK on order_change_actions). Adding the reverse
    // import creates a circular schema dependency that Drizzle cannot resolve.
    // Intentional design compromise: referential integrity for this column is soft.
    // To trace an event back to its order, join via order_change_actions.resulting_relation_id.
    triggeredByOrderId: uuid('triggered_by_order_id'),
    // Point-in-time snapshot of the relation state at event time.
    snapshot: jsonb('snapshot').notNull().default(sql`'{}'::jsonb`),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    check(
      'relation_events_type_check',
      sql`${table.eventType} IN ('CREATED', 'TERMINATED', 'UPDATED', 'REACTIVATED')`,
    ),
    index('idx_relation_events_relation').on(table.relationId),
  ],
)

// ── TypeScript types ───────────────────────────────────────────────
export type Relation = typeof relations.$inferSelect
export type NewRelation = typeof relations.$inferInsert
export type RelationEvent = typeof relationEvents.$inferSelect
export type NewRelationEvent = typeof relationEvents.$inferInsert
