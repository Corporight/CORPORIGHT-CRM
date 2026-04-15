// aml.ts — Anti-Money Laundering / KYC compliance module
//
// ── Module purpose ─────────────────────────────────────────────────
// Tracks KYC status, risk classification, and compliance decisions per subject.
// No external API integration in Phase 1 — all records are created manually.
//
// ── Two-table design ──────────────────────────────────────────────
// aml_records  — current compliance summary for a subject (1:1 with subjects)
// aml_checks   — immutable history of individual checks performed (1:N per subject)
//
// aml_records is the "what is the current state?" answer.
// aml_checks   is the "what was done and when?" audit trail.
//
// These are kept separate because:
//   - The summary can be updated without losing check history
//   - Checks are append-only; the record is mutable
//   - Future automation can derive/update the record from check results
//
// ── kyc_status lifecycle ───────────────────────────────────────────
// NOT_STARTED → no checks have been initiated for this subject
// IN_PROGRESS → at least one check is PENDING (work underway)
// COMPLETED   → all required checks have passed; subject is verified
// REJECTED    → at least one check has FAILED; subject cannot be onboarded
//
// In Phase 1, kyc_status is updated manually by the operator after reviewing
// check results. The status on aml_records is the operator's conclusion, not
// a mechanical derivation. Phase 2 can introduce auto-derivation rules.
//
// ── risk_level lifecycle ───────────────────────────────────────────
// Assigned by the operator based on subject profile, jurisdiction, and
// business context. Not computed automatically in Phase 1.
// Expected evolution:
//   Phase 1: manual assignment at record creation or after review
//   Phase 2: suggest risk level based on check results (PEP hit, sanctions hit)
//   Phase 3: integrate external scoring; auto-elevate on threshold events
//
// A NULL risk_level means classification has not yet been performed.
//
// ── Conventions ────────────────────────────────────────────────────
// - All user FKs use onDelete: 'set null'
// - subject FKs use onDelete: 'restrict' — AML data must not be orphaned silently
// - updatedAt is not auto-maintained by PostgreSQL; set explicitly on every UPDATE
// - aml_checks rows are INSERT-only — never UPDATE or DELETE

import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './shared'
import { subjects } from './subjects'

// ── Controlled vocabularies ────────────────────────────────────────

export const KYC_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
] as const
export type KycStatus = (typeof KYC_STATUSES)[number]

export const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export const CHECK_TYPES = ['DOCUMENT', 'SANCTIONS', 'PEP', 'MANUAL'] as const
export type CheckType = (typeof CHECK_TYPES)[number]

export const CHECK_STATUSES = ['PENDING', 'PASSED', 'FAILED'] as const
export type CheckStatus = (typeof CHECK_STATUSES)[number]

// ── aml_records ────────────────────────────────────────────────────
// Current compliance summary for a subject.
// One row per subject — subject_id is the primary key (true 1:1).
//
// This row is created when AML review is initiated for a subject,
// and updated as the review progresses. It is never deleted.
//
// risk_level is nullable — NULL means "not yet classified".
// Treat NULL as distinct from LOW: it means assessment has not happened.
export const amlRecords = pgTable(
  'aml_records',
  {
    // 1:1 with subjects — subject_id IS the primary key
    subjectId: uuid('subject_id')
      .primaryKey()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    kycStatus: text('kyc_status').notNull().default('NOT_STARTED'),
    // NULL = not yet classified. Do not conflate with LOW.
    riskLevel: text('risk_level'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // updatedAt: must be set explicitly on every UPDATE — not auto-maintained by DB.
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    check(
      'aml_records_kyc_status_check',
      sql`${table.kycStatus} IN (${sql.raw(KYC_STATUSES.map((s) => `'${s}'`).join(', '))})`,
    ),
    check(
      'aml_records_risk_level_check',
      sql`${table.riskLevel} IS NULL OR ${table.riskLevel} IN (${sql.raw(RISK_LEVELS.map((l) => `'${l}'`).join(', '))})`,
    ),
  ],
)

// ── aml_checks ─────────────────────────────────────────────────────
// Immutable history of individual compliance checks performed on a subject.
// INVARIANT: rows are INSERT-only — never UPDATE or DELETE.
//
// result_payload: JSONB blob for check-specific output.
//   DOCUMENT check → { document_type, document_number, expiry, verified_by }
//   SANCTIONS check → { list_name, hit: false } or { hit: true, match_details }
//   PEP check      → { source, hit: false } or { hit: true, role, jurisdiction }
//   MANUAL check   → { reason, decision, operator_notes }
//
// checked_at records when the check was actually performed (may differ from
// created_at if results are entered retrospectively).
export const amlChecks = pgTable(
  'aml_checks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'restrict' }),
    checkType: text('check_type').notNull(),
    status: text('status').notNull().default('PENDING'),
    // Flexible payload — structure varies by check_type (see above).
    resultPayload: jsonb('result_payload'),
    // When the check was actually performed — set by the operator.
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    check(
      'aml_checks_type_check',
      sql`${table.checkType} IN (${sql.raw(CHECK_TYPES.map((t) => `'${t}'`).join(', '))})`,
    ),
    check(
      'aml_checks_status_check',
      sql`${table.status} IN (${sql.raw(CHECK_STATUSES.map((s) => `'${s}'`).join(', '))})`,
    ),
    index('idx_aml_checks_subject').on(table.subjectId),
    index('idx_aml_checks_type').on(table.checkType),
  ],
)

// ── TypeScript types ───────────────────────────────────────────────
export type AmlRecord = typeof amlRecords.$inferSelect
export type NewAmlRecord = typeof amlRecords.$inferInsert
export type AmlCheck = typeof amlChecks.$inferSelect
export type NewAmlCheck = typeof amlChecks.$inferInsert
