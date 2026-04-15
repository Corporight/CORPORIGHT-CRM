// subjects.ts — Subject identity registry
//
// Invariants (CLAUDE.md):
//   - subjects.type is immutable after INSERT (enforced at app layer + DB check constraint)
//   - COMPANY requires unique, non-null registration_number on its profile
//   - Identity = subjects (core) + person/company profile (type-specific) + addresses (1:N)
//   - Never flatten person/company fields back into subjects
//
// updated_at convention:
//   PostgreSQL does NOT auto-maintain updated_at columns.
//   Every UPDATE in application code must explicitly set updatedAt: new Date().
//   A DB trigger can centralize this in Phase 2 if preferred.
//   See: src/lib/subjects/actions.ts for the enforced pattern.
//
// User FK convention:
//   All references to users.id use onDelete: 'set null'.
//   This prevents FK violations if a user account is removed — the audit trail
//   row is preserved but the user reference becomes null.

import {
  pgTable,
  uuid,
  text,
  boolean,
  date,
  timestamp,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './shared'

// ── subjects ───────────────────────────────────────────────────────
// Core identity record. type discriminates between PERSON and COMPANY.
// display_name is a denormalized label: "First Last" for persons, company_name for companies.
// Populated on write — do not compute it on read in hot paths.
// Subjects are soft-deactivated via is_active — never hard-deleted.
export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // INVARIANT: type is immutable after INSERT
    type: text('type').notNull(), // 'PERSON' | 'COMPANY'
    displayName: text('display_name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    email: text('email'),
    phone: text('phone'),
    // Phase 1 simplification: tags stored as a flat text array, not normalized.
    // Sufficient for basic filtering. If tag management (renaming, merging, counts)
    // is needed later, migrate to a separate subject_tags table.
    tags: text('tags').array(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // updatedAt: must be set explicitly on every UPDATE — not auto-maintained by DB.
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    check('subjects_type_check', sql`${table.type} IN ('PERSON', 'COMPANY')`),
  ],
)

// ── subject_person_profiles ────────────────────────────────────────
// 1:1 with subjects WHERE type = 'PERSON'.
// Created in the same transaction as the parent subject row.
export const subjectPersonProfiles = pgTable('subject_person_profiles', {
  subjectId: uuid('subject_id')
    .primaryKey()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  birthDate: date('birth_date'),
  birthNumber: text('birth_number'), // rodné číslo or equivalent
  nationality: text('nationality'),
  idDocType: text('id_doc_type'), // 'PASSPORT' | 'ID_CARD'
  idDocNumber: text('id_doc_number'),
  idDocExpiry: date('id_doc_expiry'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // updatedAt: must be set explicitly on every UPDATE — not auto-maintained by DB.
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
})

// ── subject_company_profiles ───────────────────────────────────────
// 1:1 with subjects WHERE type = 'COMPANY'.
// INVARIANT: registration_number (IČO) is UNIQUE and NOT NULL.
export const subjectCompanyProfiles = pgTable('subject_company_profiles', {
  subjectId: uuid('subject_id')
    .primaryKey()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  companyName: text('company_name').notNull(),
  registrationNumber: text('registration_number').notNull().unique(), // IČO
  vatNumber: text('vat_number'),
  legalForm: text('legal_form'),
  registrationDate: date('registration_date'),
  registrationCourt: text('registration_court'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // updatedAt: must be set explicitly on every UPDATE — not auto-maintained by DB.
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
})

// ── subject_addresses ──────────────────────────────────────────────
// 1:N. Typed, no temporal validity — active/primary model.
// INVARIANT: at most one is_primary = true per (subject_id, address_type),
// enforced by partial unique index.
export const subjectAddresses = pgTable(
  'subject_addresses',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    addressType: text('address_type').notNull(), // 'REGISTERED' | 'MAILING' | 'BILLING' | 'OPERATIONAL'
    street: text('street').notNull(),
    city: text('city').notNull(),
    postal: text('postal').notNull(),
    country: text('country').notNull().default('CZ'),
    isPrimary: boolean('is_primary').notNull().default(false),
    // Soft-deactivate instead of deleting. When deactivating a primary address,
    // set is_primary = false first to release the partial unique index slot.
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // updatedAt: must be set explicitly on every UPDATE — not auto-maintained by DB.
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    // Only one primary address allowed per subject per address type
    uniqueIndex('uq_subject_address_primary')
      .on(table.subjectId, table.addressType)
      .where(sql`${table.isPrimary} = true`),
    check(
      'subject_addresses_type_check',
      sql`${table.addressType} IN ('REGISTERED', 'MAILING', 'BILLING', 'OPERATIONAL')`,
    ),
  ],
)

// ── subject_roles ──────────────────────────────────────────────────
// Logical roles assigned to subjects (CLIENT, SUPPLIER).
// These are business roles, not system roles — distinct from users.role.
// Phase 2 will add FK to role_definitions when that table is implemented.
export const subjectRoles = pgTable(
  'subject_roles',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'CLIENT' | 'SUPPLIER'
    isActive: boolean('is_active').notNull().default(true),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    // updatedAt: must be set explicitly on every UPDATE — not auto-maintained by DB.
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    check('subject_roles_role_check', sql`${table.role} IN ('CLIENT', 'SUPPLIER')`),
    // A subject should not hold the same role twice
    uniqueIndex('uq_subject_role').on(table.subjectId, table.role),
  ],
)

// ── TypeScript types ───────────────────────────────────────────────
export type Subject = typeof subjects.$inferSelect
export type NewSubject = typeof subjects.$inferInsert
export type SubjectPersonProfile = typeof subjectPersonProfiles.$inferSelect
export type SubjectCompanyProfile = typeof subjectCompanyProfiles.$inferSelect
export type SubjectAddress = typeof subjectAddresses.$inferSelect
export type SubjectRole = typeof subjectRoles.$inferSelect
