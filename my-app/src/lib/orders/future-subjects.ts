'use server'

// Future subjects service — createFutureSubject, resolveFutureSubject.
//
// Invariants (CLAUDE.md):
//   - future_subjects rows are NEVER deleted
//   - Resolution fills resolved_subject_id + resolved_at in place
//   - Re-resolving to the same subject is idempotent (safe to retry)
//   - Re-resolving to a DIFFERENT subject is an error
//   - The target subject must exist and be active before resolution

import { db } from '@/db'
import { futureSubjects, orders, subjects, auditLog } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

// ── Result type ────────────────────────────────────────────────────

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// ── Validators ──────────────────────────────────────────────────────

const createFutureSubjectSchema = z.object({
  orderId: z.string().uuid(),
  intendedType: z.enum(['PERSON', 'COMPANY']),
  // Optional human label — useful for display before the real subject exists.
  intendedName: z.string().min(1).optional(),
  legalForm: z.string().optional(),
  notes: z.string().optional(),
  createdBy: z.string().uuid().optional(),
})

const resolveFutureSubjectSchema = z.object({
  futureSubjectId: z.string().uuid(),
  // The real subject that was created for this future subject.
  resolvedSubjectId: z.string().uuid(),
  resolvedBy: z.string().uuid().optional(),
})

export type CreateFutureSubjectInput = z.input<typeof createFutureSubjectSchema>
export type ResolveFutureSubjectInput = z.input<typeof resolveFutureSubjectSchema>

// ── createFutureSubject ────────────────────────────────────────────
// Registers a placeholder for a subject that does not yet legally exist.
// Used in COMPANY_FORMATION orders to represent the company being formed.
// The future subject can be added as an order participant via futureSubjectId.

export async function createFutureSubject(
  input: CreateFutureSubjectInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createFutureSubjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { orderId, intendedType, intendedName, legalForm, notes, createdBy } = parsed.data

  // Verify the order exists and is open for modification.
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { id: true, status: true },
  })
  if (!order) {
    return { success: false, error: 'Order not found.' }
  }
  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
    return {
      success: false,
      error: `Cannot add a future subject to a ${order.status} order.`,
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [fs] = await tx
        .insert(futureSubjects)
        .values({
          orderId,
          intendedType,
          intendedName: intendedName ?? null,
          legalForm: legalForm ?? null,
          notes: notes ?? null,
          createdBy: createdBy ?? null,
        })
        .returning({ id: futureSubjects.id })

      await tx.insert(auditLog).values({
        entityType: 'future_subject',
        entityId: fs.id,
        action: 'FUTURE_SUBJECT_CREATED',
        diff: { orderId, intendedType, intendedName: intendedName ?? null },
        userId: createdBy ?? null,
      })

      return fs
    })

    return { success: true, data: { id: result.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── resolveFutureSubject ───────────────────────────────────────────
// Called when the legal entity that the future subject represented has been
// created (e.g. the company is registered and has an IČO).
//
// Sets resolved_subject_id and resolved_at. The row is never deleted.
//
// Idempotency rule:
//   - Resolving to the SAME subject again: returns success (safe retry).
//   - Resolving to a DIFFERENT subject: returns an error.

export async function resolveFutureSubject(
  input: ResolveFutureSubjectInput,
): Promise<ActionResult<{ id: string; resolvedSubjectId: string }>> {
  const parsed = resolveFutureSubjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { futureSubjectId, resolvedSubjectId, resolvedBy } = parsed.data

  // Load the future subject.
  const fs = await db.query.futureSubjects.findFirst({
    where: eq(futureSubjects.id, futureSubjectId),
    columns: { id: true, resolvedSubjectId: true, resolvedAt: true, orderId: true },
  })
  if (!fs) {
    return { success: false, error: 'Future subject not found.' }
  }

  // Idempotency check.
  if (fs.resolvedSubjectId !== null) {
    if (fs.resolvedSubjectId === resolvedSubjectId) {
      // Already resolved to the same subject — safe to return success.
      return { success: true, data: { id: futureSubjectId, resolvedSubjectId } }
    }
    return {
      success: false,
      error:
        `Future subject ${futureSubjectId} is already resolved to subject ` +
        `${fs.resolvedSubjectId}. Cannot re-resolve to a different subject.`,
    }
  }

  // Verify the target subject exists and is active.
  const target = await db.query.subjects.findFirst({
    where: eq(subjects.id, resolvedSubjectId),
    columns: { id: true, isActive: true, type: true, displayName: true },
  })
  if (!target) {
    return { success: false, error: `Resolved subject not found: ${resolvedSubjectId}` }
  }
  if (!target.isActive) {
    return {
      success: false,
      error: `Cannot resolve to an inactive subject: ${resolvedSubjectId}`,
    }
  }

  try {
    await db.transaction(async (tx) => {
      const now = new Date()

      await tx
        .update(futureSubjects)
        .set({
          resolvedSubjectId,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(futureSubjects.id, futureSubjectId))

      await tx.insert(auditLog).values({
        entityType: 'future_subject',
        entityId: futureSubjectId,
        action: 'FUTURE_SUBJECT_RESOLVED',
        diff: {
          resolvedSubjectId,
          resolvedSubjectType: target.type,
          resolvedSubjectName: target.displayName,
          orderId: fs.orderId,
        },
        userId: resolvedBy ?? null,
      })
    })

    return { success: true, data: { id: futureSubjectId, resolvedSubjectId } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
