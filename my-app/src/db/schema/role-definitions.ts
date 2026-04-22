import { pgTable, text, boolean, integer, timestamp, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const ROLE_PARTICIPANT_TYPES = ['CORPORATE', 'SERVICE'] as const
export type RoleParticipantType = (typeof ROLE_PARTICIPANT_TYPES)[number]

export const AML_REQUIREMENTS = ['REQUIRED', 'OPTIONAL', 'EXEMPT'] as const
export type AmlRequirement = (typeof AML_REQUIREMENTS)[number]

export const roleDefinitions = pgTable(
  'role_definitions',
  {
    // Text PK — intentional exception to the UUID-PK rule.
    // This is a reference table; its code is the meaningful identifier used
    // as a string FK from order_participants.role_code and relations.relation_type.
    code: text('code').primaryKey(),
    name: text('name').notNull(),
    participantType: text('participant_type').notNull(),
    generatesRelation: boolean('generates_relation').notNull().default(false),
    requiresShare: boolean('requires_share').notNull().default(false),
    // Phase 1A: all seed values are false (conservative placeholder).
    // Not consumed by any Phase 1A logic. Populate from spec before Phase 2 enforcement.
    requiresActingPerson: boolean('requires_acting_person').notNull().default(false),
    amlRequirement: text('aml_requirement').notNull().default('EXEMPT'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'role_definitions_participant_type_check',
      sql`${table.participantType} IN ('CORPORATE', 'SERVICE')`,
    ),
    check(
      'role_definitions_aml_requirement_check',
      sql`${table.amlRequirement} IN ('REQUIRED', 'OPTIONAL', 'EXEMPT')`,
    ),
  ],
)

export type RoleDefinition = typeof roleDefinitions.$inferSelect
