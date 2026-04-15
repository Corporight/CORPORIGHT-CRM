// shared.ts — foundational tables referenced across all modules
// Users and audit_log must exist from day one (CLAUDE.md invariant)

import { pgTable, uuid, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ── users ──────────────────────────────────────────────────────────
// Minimal stub — expanded in Administration module
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('agent'), // 'admin' | 'agent' | 'viewer'
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── audit_log ──────────────────────────────────────────────────────
// All modules write here. INSERT-only — never UPDATE or DELETE.
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  action: text('action').notNull(), // 'created' | 'updated' | 'deleted' | 'status_changed'
  diff: jsonb('diff'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
