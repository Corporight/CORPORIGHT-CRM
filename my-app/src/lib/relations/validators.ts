import { z } from 'zod'
import { RELATION_TYPES } from '@/db/schema'

// Normalizes empty/whitespace-only strings to null before validation.
const normalizeNote = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? null : v

// ── createRelation ─────────────────────────────────────────────────

export const createRelationSchema = z.object({
  subjectAId: z.string().uuid(),
  subjectBId: z.string().uuid(),
  relationType: z.enum(RELATION_TYPES),
  // ISO datetime string — defaults to now() when omitted.
  validFrom: z.string().optional(),
  triggeredByOrderId: z.string().uuid().optional(),
  sharePercentage: z.number().min(0).max(100).optional(),
  noteInternal: z.preprocess(normalizeNote, z.string().trim().nullable().optional()),
  createdBy: z.string().uuid().optional(),
})

export type CreateRelationInput = z.input<typeof createRelationSchema>

// ── terminateRelation ──────────────────────────────────────────────

export const terminateRelationSchema = z.object({
  relationId: z.string().uuid(),
  triggeredByOrderId: z.string().uuid().optional(),
  terminatedBy: z.string().uuid().optional(),
})

export type TerminateRelationInput = z.input<typeof terminateRelationSchema>

// ── updateRelation ─────────────────────────────────────────────────
// May only modify sharePercentage and noteInternal — nothing else.
// Pass null to explicitly clear a value. Omit to leave unchanged.
// Requires a non-empty reason for the event record.

export const updateRelationSchema = z
  .object({
    relationId: z.string().uuid(),
    sharePercentage: z.number().min(0).max(100).nullable().optional(),
    noteInternal: z.preprocess(normalizeNote, z.string().trim().nullable().optional()),
    reason: z.string().trim().min(1, 'Reason is required'),
    updatedBy: z.string().uuid().optional(),
  })
  .refine(
    (d) => d.sharePercentage !== undefined || d.noteInternal !== undefined,
    { message: 'At least one of sharePercentage or noteInternal must be provided' },
  )

export type UpdateRelationInput = z.input<typeof updateRelationSchema>

// ── reactivateRelation ─────────────────────────────────────────────

export const reactivateRelationSchema = z.object({
  relationId: z.string().uuid(),
  reason: z.string().trim().min(1, 'Reason is required'),
  reactivatedBy: z.string().uuid().optional(),
})

export type ReactivateRelationInput = z.input<typeof reactivateRelationSchema>

// ── listRelations ──────────────────────────────────────────────────
// Global overview list. isActive defaults to true (active only).
// Pass isActive: false to retrieve inactive/terminated records.

export const listRelationsSchema = z.object({
  relationType: z.enum(RELATION_TYPES).optional(),
  isActive: z.boolean().default(true),
  subjectId: z.string().uuid().optional(), // matches either side (A or B)
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
})

export type ListRelationsInput = z.input<typeof listRelationsSchema>
export type ListRelationsQuery = z.infer<typeof listRelationsSchema>

// ── getRelationDetail ──────────────────────────────────────────────

export const getRelationDetailSchema = z.object({
  relationId: z.string().uuid(),
})

export type GetRelationDetailInput = z.input<typeof getRelationDetailSchema>

// ── listRelationsForSubject ────────────────────────────────────────

export const listRelationsForSubjectSchema = z.object({
  subjectId: z.string().uuid(),
  includeInactive: z.boolean().default(false),
  relationType: z.enum(RELATION_TYPES).optional(),
})

export type ListRelationsForSubjectInput = z.input<typeof listRelationsForSubjectSchema>
