import { z } from 'zod'
import { RELATION_TYPES } from '@/db/schema'

// ── createRelation ─────────────────────────────────────────────────

export const createRelationSchema = z.object({
  // subjectA = the "acting" side (e.g. person who is a director / shareholder).
  subjectAId: z.string().uuid(),
  // subjectB = the "target" side (e.g. company being directed / held).
  subjectBId: z.string().uuid(),
  relationType: z.enum(RELATION_TYPES),
  // ISO datetime string for when the relation legally came into effect.
  // Defaults to now() when omitted.
  validFrom: z.string().optional(),
  // Soft reference to the order that triggered this relation, if any.
  triggeredByOrderId: z.string().uuid().optional(),
  // Key-value attributes specific to the relation type.
  // SHAREHOLDER: [{ key: 'share_percentage', value: '50.00' }]
  // DIRECTOR:    [{ key: 'acting_mode', value: 'SOLE' }]
  attributes: z
    .array(
      z.object({
        key: z.string().min(1),
        value: z.string(),
      }),
    )
    .optional(),
  createdBy: z.string().uuid().optional(),
})

export type CreateRelationInput = z.input<typeof createRelationSchema>

// ── terminateRelation ──────────────────────────────────────────────

export const terminateRelationSchema = z.object({
  relationId: z.string().uuid(),
  // Soft reference to the order that triggered this termination, if any.
  triggeredByOrderId: z.string().uuid().optional(),
  terminatedBy: z.string().uuid().optional(),
})

export type TerminateRelationInput = z.input<typeof terminateRelationSchema>

// ── listRelationsForSubject ────────────────────────────────────────

export const listRelationsForSubjectSchema = z.object({
  subjectId: z.string().uuid(),
  // When true, return both active and terminated relations. Default: active only.
  includeInactive: z.boolean().default(false),
  relationType: z.enum(RELATION_TYPES).optional(),
})

export type ListRelationsForSubjectInput = z.input<typeof listRelationsForSubjectSchema>
