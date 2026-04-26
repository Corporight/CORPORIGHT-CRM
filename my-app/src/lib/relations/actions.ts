'use server'

// Relations service layer — createRelation, terminateRelation, listRelationsForSubject.
//
// Design principles (CLAUDE.md):
//   - Relations are temporal and append-only — never update a relation row to change state
//   - Terminating = set isActive=false + validTo in the same UPDATE
//   - Every mutation produces an immutable relation_events row (INSERT-only)
//   - No polymorphic FK pairs — both sides are explicit FK columns
//   - Participant type rules (e.g. DIRECTOR = PERSON→COMPANY) enforced before insert
//   - Only one active relation of the same type between the same pair is permitted
//
// Internal helpers (createRelationInTx / terminateRelationInTx):
//   Accept a Drizzle transaction object so they can be composed inside a
//   larger transaction (e.g. applyOrderChangeActionsForOrder) without nesting.
//   They are exported so change-actions.ts can import them.
//   They are NOT intended to be called as Server Actions from client code directly.

import { db } from '@/db'
import {
  relations as relationsTable,
  relationEvents,
  subjects,
  auditLog,
  validateRelationParticipants,
} from '@/db/schema'
import { eq, and, or, desc, count, aliasedTable } from 'drizzle-orm'
import {
  createRelationSchema,
  terminateRelationSchema,
  updateRelationSchema,
  reactivateRelationSchema,
  listRelationsSchema,
  getRelationDetailSchema,
  listRelationsForSubjectSchema,
  type CreateRelationInput,
  type TerminateRelationInput,
  type UpdateRelationInput,
  type ReactivateRelationInput,
  type ListRelationsInput,
  type GetRelationDetailInput,
  type ListRelationsForSubjectInput,
} from './validators'

// ── Result type ────────────────────────────────────────────────────

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// ── Transaction type ───────────────────────────────────────────────
// Derived from the Drizzle db instance — matches the tx object passed
// to db.transaction() callbacks. Used by internal tx helpers below.

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// ── createRelationInTx ─────────────────────────────────────────────
// Internal helper — must be called within an existing db.transaction().
// Inserts the relation row + a CREATED relation_event + audit_log.
// Returns the new relation ID, or throws on validation / constraint error.
//
// Callers: createRelation (wraps in its own tx), applyOrderChangeActionsToRelationsInTx (completion.ts).

export async function createRelationInTx(
  tx: DbTx,
  input: {
    subjectAId: string
    subjectBId: string
    relationType: string
    validFrom?: string
    sharePercentage?: number | null
    noteInternal?: string | null
    triggeredByOrderId?: string | null
    createdBy?: string | null
  },
): Promise<string> {
  // Self-link guard (also enforced by DB CHECK, but surface early).
  if (input.subjectAId === input.subjectBId) {
    throw new Error('A subject cannot have a relation with itself.')
  }

  // Fetch both subjects to validate participant type rules.
  // Sequential awaits — Promise.all is unsafe inside a transaction because the
  // postgres-js driver binds a transaction to a single connection; concurrent
  // queries on that connection can cause protocol interleaving.
  const rowsA = await tx
    .select({ id: subjects.id, type: subjects.type, isActive: subjects.isActive })
    .from(subjects)
    .where(eq(subjects.id, input.subjectAId))
  const rowsB = await tx
    .select({ id: subjects.id, type: subjects.type, isActive: subjects.isActive })
    .from(subjects)
    .where(eq(subjects.id, input.subjectBId))

  if (!rowsA[0]) throw new Error(`Subject A not found: ${input.subjectAId}`)
  if (!rowsB[0]) throw new Error(`Subject B not found: ${input.subjectBId}`)
  if (!rowsA[0].isActive) throw new Error(`Subject A is inactive: ${input.subjectAId}`)
  if (!rowsB[0].isActive) throw new Error(`Subject B is inactive: ${input.subjectBId}`)

  // Validate participant types against RELATION_TYPE_RULES.
  const typeError = validateRelationParticipants(
    input.relationType as Parameters<typeof validateRelationParticipants>[0],
    rowsA[0].type as 'PERSON' | 'COMPANY',
    rowsB[0].type as 'PERSON' | 'COMPANY',
  )
  if (typeError) throw new Error(typeError)

  // Uniqueness: only one ACTIVE relation of the same type between the same pair.
  const duplicate = await tx
    .select({ id: relationsTable.id })
    .from(relationsTable)
    .where(
      and(
        eq(relationsTable.subjectAId, input.subjectAId),
        eq(relationsTable.subjectBId, input.subjectBId),
        eq(relationsTable.relationType, input.relationType),
        eq(relationsTable.isActive, true),
      ),
    )

  if (duplicate.length > 0) {
    throw new Error(
      `An active ${input.relationType} relation already exists between these subjects ` +
        `(id: ${duplicate[0].id}). Terminate the existing relation first.`,
    )
  }

  const validFrom = input.validFrom ? new Date(input.validFrom) : new Date()

  const [relation] = await tx
    .insert(relationsTable)
    .values({
      subjectAId: input.subjectAId,
      subjectBId: input.subjectBId,
      relationType: input.relationType,
      validFrom,
      isActive: true,
      sharePercentage: input.sharePercentage?.toString() ?? null,
      noteInternal: input.noteInternal ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: relationsTable.id })

  // Immutable event record.
  await tx.insert(relationEvents).values({
    relationId: relation.id,
    eventType: 'CREATED',
    triggeredByOrderId: input.triggeredByOrderId ?? null,
    note: null,
    snapshot: {
      subjectAId: input.subjectAId,
      subjectBId: input.subjectBId,
      relationType: input.relationType,
      validFrom: validFrom.toISOString(),
      sharePercentage: input.sharePercentage ?? null,
      noteInternal: input.noteInternal ?? null,
    },
    createdBy: input.createdBy ?? null,
  })

  // Audit log.
  await tx.insert(auditLog).values({
    entityType: 'relation',
    entityId: relation.id,
    action: 'RELATION_CREATED',
    diff: {
      subjectAId: input.subjectAId,
      subjectBId: input.subjectBId,
      relationType: input.relationType,
      triggeredByOrderId: input.triggeredByOrderId ?? null,
    },
    userId: input.createdBy ?? null,
  })

  return relation.id
}

// ── terminateRelationInTx ──────────────────────────────────────────
// Internal helper — must be called within an existing db.transaction().
// Sets isActive=false and validTo=now() on the relation row,
// then inserts a TERMINATED relation_event + audit_log.
// Returns the relation ID, or throws if not found / already inactive.
//
// Callers: terminateRelation (wraps in its own tx), applyOrderChangeActionsToRelationsInTx (completion.ts).

export async function terminateRelationInTx(
  tx: DbTx,
  input: {
    relationId: string
    reason?: string | null
    validTo?: Date | null
    triggeredByOrderId?: string | null
    terminatedBy?: string | null
  },
): Promise<string> {
  const existing = await tx
    .select()
    .from(relationsTable)
    .where(eq(relationsTable.id, input.relationId))

  if (!existing[0]) {
    throw new Error(`Relation not found: ${input.relationId}`)
  }
  if (!existing[0].isActive) {
    throw new Error(
      `Relation ${input.relationId} is already terminated ` +
        `(validTo: ${existing[0].validTo?.toISOString() ?? 'null'}).`,
    )
  }

  const now = new Date()
  const terminalDate = input.validTo ?? now

  // validTo must not precede validFrom.
  if (input.validTo && existing[0].validFrom && input.validTo < existing[0].validFrom) {
    throw new Error(
      `Termination date (${input.validTo.toISOString().slice(0, 10)}) cannot be ` +
        `earlier than the relation's valid-from date ` +
        `(${existing[0].validFrom.toISOString().slice(0, 10)}).`,
    )
  }

  await tx
    .update(relationsTable)
    .set({
      isActive: false,
      validTo: terminalDate,
      updatedAt: now,
    })
    .where(eq(relationsTable.id, input.relationId))

  // Immutable event record — snapshot the pre-termination state.
  await tx.insert(relationEvents).values({
    relationId: input.relationId,
    eventType: 'TERMINATED',
    triggeredByOrderId: input.triggeredByOrderId ?? null,
    note: input.reason ?? null,
    snapshot: {
      terminatedAt: terminalDate.toISOString(),
      reason: input.reason ?? null,
      previousState: {
        subjectAId: existing[0].subjectAId,
        subjectBId: existing[0].subjectBId,
        relationType: existing[0].relationType,
        validFrom: existing[0].validFrom?.toISOString() ?? null,
        isActive: true,
      },
    },
    createdBy: input.terminatedBy ?? null,
  })

  // Audit log.
  await tx.insert(auditLog).values({
    entityType: 'relation',
    entityId: input.relationId,
    action: 'RELATION_TERMINATED',
    diff: {
      terminatedAt: terminalDate.toISOString(),
      reason: input.reason ?? null,
      triggeredByOrderId: input.triggeredByOrderId ?? null,
    },
    userId: input.terminatedBy ?? null,
  })

  return input.relationId
}

// ── createRelation ─────────────────────────────────────────────────
// Public server action. Wraps createRelationInTx in its own transaction.

export async function createRelation(
  input: CreateRelationInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createRelationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    const id = await db.transaction(async (tx) =>
      createRelationInTx(tx, {
        subjectAId: parsed.data.subjectAId,
        subjectBId: parsed.data.subjectBId,
        relationType: parsed.data.relationType,
        validFrom: parsed.data.validFrom,
        sharePercentage: parsed.data.sharePercentage ?? null,
        noteInternal: parsed.data.noteInternal ?? null,
        triggeredByOrderId: parsed.data.triggeredByOrderId ?? null,
        createdBy: parsed.data.createdBy ?? null,
      }),
    )
    return { success: true, data: { id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── terminateRelation ──────────────────────────────────────────────
// Public server action. Wraps terminateRelationInTx in its own transaction.

export async function terminateRelation(
  input: TerminateRelationInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = terminateRelationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    const id = await db.transaction(async (tx) =>
      terminateRelationInTx(tx, {
        relationId: parsed.data.relationId,
        reason: parsed.data.reason,
        validTo: parsed.data.validTo ? new Date(parsed.data.validTo) : null,
        triggeredByOrderId: parsed.data.triggeredByOrderId ?? null,
        terminatedBy: parsed.data.terminatedBy ?? null,
      }),
    )
    return { success: true, data: { id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── listRelationsForSubject ────────────────────────────────────────
// Returns all relations where the subject appears on either side (A or B).
// Defaults to active relations only. Pass includeInactive: true for full history.

export type RelationListItem = {
  id: string
  subjectAId: string
  subjectAName: string
  subjectBId: string
  subjectBName: string
  relationType: string
  isActive: boolean
  validFrom: Date | null
  validTo: Date | null
  sharePercentage: string | null
  noteInternal: string | null
  createdAt: Date
}

export async function listRelationsForSubject(
  input: ListRelationsForSubjectInput,
): Promise<ActionResult<{ items: RelationListItem[] }>> {
  const parsed = listRelationsForSubjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { subjectId, includeInactive, relationType } = parsed.data
  const subjectA = aliasedTable(subjects, 'subject_a')
  const subjectB = aliasedTable(subjects, 'subject_b')

  try {
    const items = await db
      .select({
        id: relationsTable.id,
        subjectAId: relationsTable.subjectAId,
        subjectAName: subjectA.displayName,
        subjectBId: relationsTable.subjectBId,
        subjectBName: subjectB.displayName,
        relationType: relationsTable.relationType,
        isActive: relationsTable.isActive,
        validFrom: relationsTable.validFrom,
        validTo: relationsTable.validTo,
        sharePercentage: relationsTable.sharePercentage,
        noteInternal: relationsTable.noteInternal,
        createdAt: relationsTable.createdAt,
      })
      .from(relationsTable)
      .leftJoin(subjectA, eq(relationsTable.subjectAId, subjectA.id))
      .leftJoin(subjectB, eq(relationsTable.subjectBId, subjectB.id))
      .where(
        and(
          or(
            eq(relationsTable.subjectAId, subjectId),
            eq(relationsTable.subjectBId, subjectId),
          ),
          !includeInactive ? eq(relationsTable.isActive, true) : undefined,
          relationType ? eq(relationsTable.relationType, relationType) : undefined,
        ),
      )
      .orderBy(relationsTable.createdAt)

    return {
      success: true,
      data: {
        items: items.map((r) => ({
          ...r,
          subjectAName: r.subjectAName ?? r.subjectAId,
          subjectBName: r.subjectBName ?? r.subjectBId,
        })),
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── updateRelation ─────────────────────────────────────────────────
// Updates sharePercentage and/or noteInternal on an active relation.
// No other fields may be modified through this action.
// Requires a non-empty reason stored in the UPDATED event snapshot.

export async function updateRelation(
  input: UpdateRelationInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateRelationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(relationsTable)
        .where(eq(relationsTable.id, parsed.data.relationId))

      if (!existing[0]) throw new Error(`Relation not found: ${parsed.data.relationId}`)
      if (!existing[0].isActive) throw new Error('Cannot update a terminated relation.')

      const now = new Date()

      type RelationUpdates = {
        updatedAt: Date
        sharePercentage?: string | null
        noteInternal?: string | null
      }
      const updates: RelationUpdates = { updatedAt: now }

      if (parsed.data.sharePercentage !== undefined) {
        updates.sharePercentage =
          parsed.data.sharePercentage !== null
            ? parsed.data.sharePercentage.toString()
            : null
      }
      if (parsed.data.noteInternal !== undefined) {
        updates.noteInternal = parsed.data.noteInternal
      }

      await tx
        .update(relationsTable)
        .set(updates)
        .where(eq(relationsTable.id, parsed.data.relationId))

      // UPDATED event — before/after snapshot so the change is fully auditable.
      await tx.insert(relationEvents).values({
        relationId: parsed.data.relationId,
        eventType: 'UPDATED',
        note: parsed.data.reason,
        snapshot: {
          reason: parsed.data.reason,
          before: {
            sharePercentage: existing[0].sharePercentage,
            noteInternal: existing[0].noteInternal,
          },
          after: {
            sharePercentage:
              parsed.data.sharePercentage !== undefined
                ? (parsed.data.sharePercentage !== null
                    ? parsed.data.sharePercentage.toString()
                    : null)
                : existing[0].sharePercentage,
            noteInternal:
              parsed.data.noteInternal !== undefined
                ? parsed.data.noteInternal
                : existing[0].noteInternal,
          },
        },
        createdBy: parsed.data.updatedBy ?? null,
      })

      await tx.insert(auditLog).values({
        entityType: 'relation',
        entityId: parsed.data.relationId,
        action: 'RELATION_UPDATED',
        diff: { reason: parsed.data.reason, ...updates },
        userId: parsed.data.updatedBy ?? null,
      })
    })

    return { success: true, data: { id: parsed.data.relationId } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ── reactivateRelation ─────────────────────────────────────────────
// Restores a terminated relation to active. Checks for uniqueness
// conflict before hitting the partial unique index — surfaces a
// readable error message if another active relation already exists.

export async function reactivateRelation(
  input: ReactivateRelationInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = reactivateRelationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(relationsTable)
        .where(eq(relationsTable.id, parsed.data.relationId))

      if (!existing[0]) throw new Error(`Relation not found: ${parsed.data.relationId}`)
      if (existing[0].isActive) throw new Error('Relation is already active.')

      // Guard uniqueness before hitting the partial unique index.
      const conflict = await tx
        .select({ id: relationsTable.id })
        .from(relationsTable)
        .where(
          and(
            eq(relationsTable.subjectAId, existing[0].subjectAId),
            eq(relationsTable.subjectBId, existing[0].subjectBId),
            eq(relationsTable.relationType, existing[0].relationType),
            eq(relationsTable.isActive, true),
          ),
        )

      if (conflict.length > 0) {
        throw new Error(
          `Cannot reactivate: an active ${existing[0].relationType} relation already ` +
            `exists between these subjects (id: ${conflict[0].id}). Terminate it first.`,
        )
      }

      const now = new Date()

      await tx
        .update(relationsTable)
        .set({ isActive: true, validTo: null, updatedAt: now })
        .where(eq(relationsTable.id, parsed.data.relationId))

      await tx.insert(relationEvents).values({
        relationId: parsed.data.relationId,
        eventType: 'REACTIVATED',
        note: parsed.data.reason,
        snapshot: {
          reason: parsed.data.reason,
          reactivatedAt: now.toISOString(),
          previousValidTo: existing[0].validTo?.toISOString() ?? null,
        },
        createdBy: parsed.data.reactivatedBy ?? null,
      })

      await tx.insert(auditLog).values({
        entityType: 'relation',
        entityId: parsed.data.relationId,
        action: 'RELATION_REACTIVATED',
        diff: { reason: parsed.data.reason, reactivatedAt: now.toISOString() },
        userId: parsed.data.reactivatedBy ?? null,
      })
    })

    return { success: true, data: { id: parsed.data.relationId } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ── listRelations ──────────────────────────────────────────────────
// Global overview list. Supports active and historical records through
// isActive filter (default: true). Not active-only.

export type RelationOverviewItem = {
  id: string
  relationType: string
  isActive: boolean
  subjectAId: string
  subjectAName: string
  subjectBId: string
  subjectBName: string
  sharePercentage: string | null
  validFrom: Date | null
  validTo: Date | null
  createdAt: Date
}

export async function listRelations(
  input: ListRelationsInput,
): Promise<ActionResult<{ items: RelationOverviewItem[]; total: number }>> {
  const parsed = listRelationsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { relationType, isActive, subjectId, limit, offset } = parsed.data
  const subjectA = aliasedTable(subjects, 'subject_a')
  const subjectB = aliasedTable(subjects, 'subject_b')

  const filters = and(
    eq(relationsTable.isActive, isActive),
    relationType ? eq(relationsTable.relationType, relationType) : undefined,
    subjectId
      ? or(
          eq(relationsTable.subjectAId, subjectId),
          eq(relationsTable.subjectBId, subjectId),
        )
      : undefined,
  )

  try {
    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: relationsTable.id,
          relationType: relationsTable.relationType,
          isActive: relationsTable.isActive,
          subjectAId: relationsTable.subjectAId,
          subjectAName: subjectA.displayName,
          subjectBId: relationsTable.subjectBId,
          subjectBName: subjectB.displayName,
          sharePercentage: relationsTable.sharePercentage,
          validFrom: relationsTable.validFrom,
          validTo: relationsTable.validTo,
          createdAt: relationsTable.createdAt,
        })
        .from(relationsTable)
        .leftJoin(subjectA, eq(relationsTable.subjectAId, subjectA.id))
        .leftJoin(subjectB, eq(relationsTable.subjectBId, subjectB.id))
        .where(filters)
        .orderBy(desc(relationsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(relationsTable).where(filters),
    ])

    return {
      success: true,
      data: {
        items: rows.map((r) => ({
          ...r,
          subjectAName: r.subjectAName ?? r.subjectAId,
          subjectBName: r.subjectBName ?? r.subjectBId,
        })),
        total: Number(countRows[0].value),
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

// ── getRelationDetail ──────────────────────────────────────────────
// Returns full relation data with both subject display names and the
// complete event history (newest first). Each event includes
// triggeredByOrderId (spec: source_order_id) and the full snapshot.

export type RelationEventSummary = {
  id: string
  eventType: string
  note: string | null
  snapshot: unknown
  triggeredByOrderId: string | null
  createdAt: Date
  createdBy: string | null
}

export type RelationDetail = {
  id: string
  relationType: string
  isActive: boolean
  subjectAId: string
  subjectAName: string
  subjectBId: string
  subjectBName: string
  sharePercentage: string | null
  noteInternal: string | null
  validFrom: Date | null
  validTo: Date | null
  createdAt: Date
  updatedAt: Date
  events: RelationEventSummary[]
}

export async function getRelationDetail(
  input: GetRelationDetailInput,
): Promise<ActionResult<RelationDetail>> {
  const parsed = getRelationDetailSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    const subjectA = aliasedTable(subjects, 'subject_a')
    const subjectB = aliasedTable(subjects, 'subject_b')

    const rows = await db
      .select({
        id: relationsTable.id,
        relationType: relationsTable.relationType,
        isActive: relationsTable.isActive,
        subjectAId: relationsTable.subjectAId,
        subjectAName: subjectA.displayName,
        subjectBId: relationsTable.subjectBId,
        subjectBName: subjectB.displayName,
        sharePercentage: relationsTable.sharePercentage,
        noteInternal: relationsTable.noteInternal,
        validFrom: relationsTable.validFrom,
        validTo: relationsTable.validTo,
        createdAt: relationsTable.createdAt,
        updatedAt: relationsTable.updatedAt,
      })
      .from(relationsTable)
      .leftJoin(subjectA, eq(relationsTable.subjectAId, subjectA.id))
      .leftJoin(subjectB, eq(relationsTable.subjectBId, subjectB.id))
      .where(eq(relationsTable.id, parsed.data.relationId))

    if (!rows[0]) {
      return { success: false, error: 'Relation not found' }
    }

    const events = await db
      .select({
        id: relationEvents.id,
        eventType: relationEvents.eventType,
        note: relationEvents.note,
        snapshot: relationEvents.snapshot,
        triggeredByOrderId: relationEvents.triggeredByOrderId,
        createdAt: relationEvents.createdAt,
        createdBy: relationEvents.createdBy,
      })
      .from(relationEvents)
      .where(eq(relationEvents.relationId, parsed.data.relationId))
      .orderBy(desc(relationEvents.createdAt))

    const row = rows[0]
    return {
      success: true,
      data: {
        ...row,
        subjectAName: row.subjectAName ?? row.subjectAId,
        subjectBName: row.subjectBName ?? row.subjectBId,
        events,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
