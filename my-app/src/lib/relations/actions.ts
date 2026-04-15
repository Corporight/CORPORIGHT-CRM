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
  relationAttributes,
  relationEvents,
  subjects,
  auditLog,
  validateRelationParticipants,
} from '@/db/schema'
import { eq, and, or } from 'drizzle-orm'
import {
  createRelationSchema,
  terminateRelationSchema,
  listRelationsForSubjectSchema,
  type CreateRelationInput,
  type TerminateRelationInput,
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
// Inserts the relation row + attributes + a CREATED relation_event + audit_log.
// Returns the new relation ID, or throws on validation / constraint error.
//
// Callers: createRelation (wraps in its own tx), applyOrderChangeActionsForOrder.

export async function createRelationInTx(
  tx: DbTx,
  input: {
    subjectAId: string
    subjectBId: string
    relationType: string
    validFrom?: string
    triggeredByOrderId?: string | null
    createdBy?: string | null
    attributes?: { key: string; value: string }[]
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
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: relationsTable.id })

  // Insert any type-specific attributes.
  if (input.attributes && input.attributes.length > 0) {
    await tx.insert(relationAttributes).values(
      input.attributes.map((attr) => ({
        relationId: relation.id,
        key: attr.key,
        value: attr.value,
      })),
    )
  }

  // Immutable event record.
  await tx.insert(relationEvents).values({
    relationId: relation.id,
    eventType: 'CREATED',
    triggeredByOrderId: input.triggeredByOrderId ?? null,
    snapshot: {
      subjectAId: input.subjectAId,
      subjectBId: input.subjectBId,
      relationType: input.relationType,
      validFrom: validFrom.toISOString(),
      attributes: input.attributes ?? [],
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
// Callers: terminateRelation (wraps in its own tx), applyOrderChangeActionsForOrder.

export async function terminateRelationInTx(
  tx: DbTx,
  input: {
    relationId: string
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

  await tx
    .update(relationsTable)
    .set({
      isActive: false,
      validTo: now,
      updatedAt: now,
    })
    .where(eq(relationsTable.id, input.relationId))

  // Immutable event record — snapshot the pre-termination state.
  await tx.insert(relationEvents).values({
    relationId: input.relationId,
    eventType: 'TERMINATED',
    triggeredByOrderId: input.triggeredByOrderId ?? null,
    snapshot: {
      terminatedAt: now.toISOString(),
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
      terminatedAt: now.toISOString(),
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
        triggeredByOrderId: parsed.data.triggeredByOrderId ?? null,
        createdBy: parsed.data.createdBy ?? null,
        attributes: parsed.data.attributes,
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
  subjectBId: string
  relationType: string
  isActive: boolean
  validFrom: Date | null
  validTo: Date | null
  createdAt: Date
  attributes: { key: string; value: string }[]
}

export async function listRelationsForSubject(
  input: ListRelationsForSubjectInput,
): Promise<ActionResult<{ items: RelationListItem[] }>> {
  const parsed = listRelationsForSubjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { subjectId, includeInactive, relationType } = parsed.data

  try {
    const rows = await db
      .select({
        id: relationsTable.id,
        subjectAId: relationsTable.subjectAId,
        subjectBId: relationsTable.subjectBId,
        relationType: relationsTable.relationType,
        isActive: relationsTable.isActive,
        validFrom: relationsTable.validFrom,
        validTo: relationsTable.validTo,
        createdAt: relationsTable.createdAt,
      })
      .from(relationsTable)
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

    // Fetch attributes per relation.
    // Phase 1 simplification: N+1 is acceptable for the low volume of relations per subject.
    const items = await Promise.all(
      rows.map(async (row) => {
        const attrs = await db
          .select({ key: relationAttributes.key, value: relationAttributes.value })
          .from(relationAttributes)
          .where(eq(relationAttributes.relationId, row.id))
        return { ...row, attributes: attrs }
      }),
    )

    return { success: true, data: { items } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
