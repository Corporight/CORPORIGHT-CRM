// Order completion hooks — type-specific side effects run atomically inside
// the updateOrderStatus transaction when newStatus = COMPLETED.
//
// A failure here rolls back the status change entirely — no partial state.
// The hook receives the already-open tx so all writes share one commit.
//
// Routing by order type:
//   COMPANY_FORMATION → applyParticipantGeneratedRelationsInTx
//     Creates a relation for every eligible participant (generates_relation=true,
//     participantContextType != SIGNER) to the resolved company subject.
//     Requires exactly one resolved COMPANY future subject.
//
//   COMPANY_CHANGE → applyOrderChangeActionsToRelationsInTx
//     Applies all PENDING order_change_actions inside the completion transaction.
//     COMPANY_CHANGE_NOTARY and COMPANY_CHANGE_COURT are business variants of
//     COMPANY_CHANGE and route here — they are not separate order_type values.
//
//   All other order types: no relation side effects in Phase 1/2A.
//
// CHANGE_ACTION_RELATION_FLAGS: thin readability constant. NOT a dispatch engine —
// branches are still explicit if/else per action type.

import { eq, and, inArray } from 'drizzle-orm'
import { db } from '@/db'
import {
  orders,
  orderParticipants,
  orderChangeActions,
  futureSubjects,
  roleDefinitions,
  auditLog,
  relations as relationsTable,
} from '@/db/schema'
import { createRelationInTx, terminateRelationInTx } from '@/lib/relations/actions'
import { z } from 'zod'

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// ── Readability layer ──────────────────────────────────────────────
// Documents the relation-generation intent of each action type.
// Exported to satisfy ESLint; not used for generic dispatch.
export const CHANGE_ACTION_RELATION_FLAGS = {
  DIRECTOR_APPOINTMENT: { generatesStart: true,  generatesEnd: false },
  DIRECTOR_REMOVAL:     { generatesStart: false, generatesEnd: true  },
  SHARE_TRANSFER:       { specialized: true },
  ADDRESS_CHANGE:       { generatesStart: false, generatesEnd: false },
  NAME_CHANGE:          { generatesStart: false, generatesEnd: false },
  STATUTORY_REP_CHANGE: { generatesStart: false, generatesEnd: false },
  CAPITAL_CHANGE:       { generatesStart: false, generatesEnd: false },
  OTHER:                { generatesStart: false, generatesEnd: false },
} as const

// ── JSONB payload schemas (DIRECTOR_* actions only) ────────────────
// SHARE_TRANSFER no longer reads subject IDs from JSONB — subjects come
// from order_participants (TRANSFEROR / ACQUIRER) and share from the
// dedicated orderChangeActions.sharePercentage column.

const directorAppointmentNewValue = z.object({
  subjectId: z.string().uuid('DIRECTOR_APPOINTMENT.newValue.subjectId must be a UUID'),
})

const directorRemovalOldValue = z.object({
  subjectId: z.string().uuid('DIRECTOR_REMOVAL.oldValue.subjectId must be a UUID'),
})

// ── applyParticipantGeneratedRelationsInTx ─────────────────────────
// For COMPANY_FORMATION orders only.
// Creates a relation for each eligible participant (generates_relation=true,
// participantContextType != SIGNER) toward the resolved company subject.
// Requires exactly one resolved COMPANY future subject for the order.
// Hard failure on any unresolvable participant or ambiguous company count.
//
// Sequential awaits throughout — Promise.all is unsafe inside a postgres-js
// transaction because the driver binds a transaction to a single connection;
// concurrent queries on that connection cause protocol interleaving.

export async function applyParticipantGeneratedRelationsInTx(
  tx: DbTx,
  orderId: string,
  completedBy: string | null,
  now: Date,
): Promise<void> {
  // Find the company being formed — must be exactly one resolved COMPANY future subject.
  const companyFutureSubjects = await tx
    .select({ resolvedSubjectId: futureSubjects.resolvedSubjectId })
    .from(futureSubjects)
    .where(
      and(
        eq(futureSubjects.orderId, orderId),
        eq(futureSubjects.intendedType, 'COMPANY'),
      ),
    )

  if (companyFutureSubjects.length === 0) {
    throw new Error(
      'Cannot complete COMPANY_FORMATION order: no company future subject found. ' +
        'Ensure the company has been registered and its future subject resolved before completing.',
    )
  }

  if (companyFutureSubjects.length > 1) {
    throw new Error(
      `Cannot complete COMPANY_FORMATION order: ${companyFutureSubjects.length} company future subjects ` +
        'found; only one is supported per order. Cannot safely map participants to companies.',
    )
  }

  const companyId = companyFutureSubjects[0].resolvedSubjectId
  if (!companyId) {
    throw new Error(
      'Cannot complete COMPANY_FORMATION order: the company future subject exists but has not been ' +
        'resolved to a real subject. Call resolveFutureSubject() before completing.',
    )
  }

  // Load all participants for this order.
  const participants = await tx
    .select({
      roleCode: orderParticipants.roleCode,
      subjectId: orderParticipants.subjectId,
      futureSubjectId: orderParticipants.futureSubjectId,
      sharePercentage: orderParticipants.sharePercentage,
      participantContextType: orderParticipants.participantContextType,
    })
    .from(orderParticipants)
    .where(eq(orderParticipants.orderId, orderId))

  if (participants.length === 0) return

  // Batch-fetch role_definitions for all unique roleCodes present.
  // Absent codes are treated as generates_relation=false.
  const roleCodes = [...new Set(participants.map((p) => p.roleCode))]
  const roleRows = await tx
    .select({ code: roleDefinitions.code, generatesRelation: roleDefinitions.generatesRelation })
    .from(roleDefinitions)
    .where(inArray(roleDefinitions.code, roleCodes))
  const roleMap = new Map(roleRows.map((r) => [r.code, r.generatesRelation]))

  // Resolve futureSubjectId participants to their real subject IDs.
  const futureSubjectIds = participants
    .filter((p) => p.futureSubjectId != null)
    .map((p) => p.futureSubjectId!)

  const futureResolutionMap = new Map<string, string>()
  if (futureSubjectIds.length > 0) {
    const resolvedRows = await tx
      .select({ id: futureSubjects.id, resolvedSubjectId: futureSubjects.resolvedSubjectId })
      .from(futureSubjects)
      .where(inArray(futureSubjects.id, futureSubjectIds))

    for (const row of resolvedRows) {
      if (row.resolvedSubjectId) {
        futureResolutionMap.set(row.id, row.resolvedSubjectId)
      }
    }
  }

  // Create a relation for each eligible participant.
  for (const participant of participants) {
    // SIGNER participants are signing documents, not being structurally appointed.
    if (participant.participantContextType === 'SIGNER') continue

    // Skip if role is absent from role_definitions or has generates_relation=false.
    if (roleMap.get(participant.roleCode) !== true) continue

    const participantSubjectId =
      participant.subjectId ??
      (participant.futureSubjectId
        ? (futureResolutionMap.get(participant.futureSubjectId) ?? null)
        : null)

    // Eligible participant with unresolvable subject is a hard failure.
    // Silent skip would create a gap in the legal record.
    if (!participantSubjectId) {
      throw new Error(
        `Cannot complete order: participant with role '${participant.roleCode}' ` +
          `has generates_relation = true but its subject could not be resolved ` +
          `(futureSubjectId: ${participant.futureSubjectId}). ` +
          'Ensure the referenced future subject is resolved before completing.',
      )
    }

    // Self-relation guard — also enforced inside createRelationInTx.
    if (participantSubjectId === companyId) continue

    await createRelationInTx(tx, {
      subjectAId: participantSubjectId,
      subjectBId: companyId,
      relationType: participant.roleCode,
      validFrom: now.toISOString(),
      sharePercentage:
        participant.sharePercentage != null ? parseFloat(participant.sharePercentage) : null,
      triggeredByOrderId: orderId,
      createdBy: completedBy,
    })
  }
}

// ── applyOrderChangeActionsToRelationsInTx ─────────────────────────
// For COMPANY_CHANGE orders only (covers COMPANY_CHANGE_NOTARY and
// COMPANY_CHANGE_COURT business variants — both share this pipeline).
//
// Applies all PENDING order_change_actions within the completion transaction.
// Each action is marked APPLIED (status, appliedAt, resultingRelationId).
// Any single failure throws — rolling back the entire completion transaction.
//
// DIRECTOR_APPOINTMENT / DIRECTOR_REMOVAL:
//   Actor subject resolved from JSONB payload (newValue / oldValue).subjectId.
//   Company subject from action.targetSubjectId.
//
// SHARE_TRANSFER (Phase 2A — simple deterministic shape only):
//   Subjects resolved from order_participants:
//     exactly 1 TRANSFEROR with roleCode = SHAREHOLDER → subjectId
//     exactly 1 ACQUIRER  with roleCode = SHAREHOLDER → subjectId
//   Share amount from action.sharePercentage (dedicated column — canonical source).
//   Hard fail on any shape that is not simple and deterministic.
//
// Documented-only actions (ADDRESS_CHANGE, NAME_CHANGE, etc.):
//   No relation mutation; marked APPLIED with resultingRelationId = null.

export async function applyOrderChangeActionsToRelationsInTx(
  tx: DbTx,
  orderId: string,
  completedBy: string | null,
  now: Date,
): Promise<void> {
  // Load all PENDING actions, insertion order = intended execution order.
  const pending = await tx
    .select()
    .from(orderChangeActions)
    .where(
      and(
        eq(orderChangeActions.orderId, orderId),
        eq(orderChangeActions.status, 'PENDING'),
      ),
    )
    .orderBy(orderChangeActions.createdAt)

  // No PENDING actions is valid — order may have been a documented-only change
  // or all actions were already cancelled by the operator before completion.
  if (pending.length === 0) return

  for (const action of pending) {
    let resultingRelationId: string | null = null

    try {
      if (action.actionType === 'DIRECTOR_APPOINTMENT') {
        // ── DIRECTOR_APPOINTMENT ─────────────────────────────────────
        if (!action.targetSubjectId) {
          throw new Error(
            'DIRECTOR_APPOINTMENT requires targetSubjectId (the company being appointed to).',
          )
        }
        const payload = directorAppointmentNewValue.safeParse(action.newValue)
        if (!payload.success) {
          throw new Error(
            `DIRECTOR_APPOINTMENT newValue is invalid: ${payload.error.issues[0].message}`,
          )
        }
        resultingRelationId = await createRelationInTx(tx, {
          subjectAId: payload.data.subjectId,
          subjectBId: action.targetSubjectId,
          relationType: 'DIRECTOR',
          validFrom: now.toISOString(),
          triggeredByOrderId: orderId,
          createdBy: completedBy,
        })

      } else if (action.actionType === 'DIRECTOR_REMOVAL') {
        // ── DIRECTOR_REMOVAL ─────────────────────────────────────────
        if (!action.targetSubjectId) {
          throw new Error(
            'DIRECTOR_REMOVAL requires targetSubjectId (the company the director is being removed from).',
          )
        }
        const payload = directorRemovalOldValue.safeParse(action.oldValue)
        if (!payload.success) {
          throw new Error(
            `DIRECTOR_REMOVAL oldValue is invalid: ${payload.error.issues[0].message}`,
          )
        }
        const activeRelations = await tx
          .select({ id: relationsTable.id })
          .from(relationsTable)
          .where(
            and(
              eq(relationsTable.subjectAId, payload.data.subjectId),
              eq(relationsTable.subjectBId, action.targetSubjectId),
              eq(relationsTable.relationType, 'DIRECTOR'),
              eq(relationsTable.isActive, true),
            ),
          )
        if (activeRelations.length === 0) {
          throw new Error(
            `No active DIRECTOR relation found: ` +
              `subject ${payload.data.subjectId} → company ${action.targetSubjectId}. ` +
              `Was the relation ever created, or has it already been terminated?`,
          )
        }
        resultingRelationId = await terminateRelationInTx(tx, {
          relationId: activeRelations[0].id,
          triggeredByOrderId: orderId,
          terminatedBy: completedBy,
        })

      } else if (action.actionType === 'SHARE_TRANSFER') {
        // ── SHARE_TRANSFER ───────────────────────────────────────────
        // Phase 2A: simple deterministic shape only.
        // Subjects from order_participants; share from action.sharePercentage.

        if (!action.targetSubjectId) {
          throw new Error(
            'SHARE_TRANSFER requires targetSubjectId (the company whose shares are being transferred).',
          )
        }

        // Validate canonical share percentage from dedicated column.
        if (action.sharePercentage === null || action.sharePercentage === undefined) {
          throw new Error(
            'SHARE_TRANSFER requires sharePercentage to be set on the change action. ' +
              'Set it before completing the order.',
          )
        }
        const sharePercentage = parseFloat(action.sharePercentage)
        if (isNaN(sharePercentage) || sharePercentage < 0 || sharePercentage > 100) {
          throw new Error(
            `SHARE_TRANSFER sharePercentage is out of range: "${action.sharePercentage}". ` +
              'Must be a number between 0 and 100.',
          )
        }

        // Resolve subjects from order_participants.
        const participants = await tx
          .select({
            subjectId: orderParticipants.subjectId,
            roleCode: orderParticipants.roleCode,
            participantContextType: orderParticipants.participantContextType,
          })
          .from(orderParticipants)
          .where(eq(orderParticipants.orderId, orderId))

        const transferors = participants.filter(
          (p) =>
            p.participantContextType === 'TRANSFEROR' && p.roleCode === 'SHAREHOLDER',
        )
        const acquirers = participants.filter(
          (p) =>
            p.participantContextType === 'ACQUIRER' && p.roleCode === 'SHAREHOLDER',
        )

        if (transferors.length !== 1) {
          throw new Error(
            `SHARE_TRANSFER requires exactly 1 TRANSFEROR participant with roleCode=SHAREHOLDER. ` +
              `Found: ${transferors.length}. ` +
              `Multiple-transferor or zero-transferor shapes are not supported in Phase 2A.`,
          )
        }
        if (acquirers.length !== 1) {
          throw new Error(
            `SHARE_TRANSFER requires exactly 1 ACQUIRER participant with roleCode=SHAREHOLDER. ` +
              `Found: ${acquirers.length}. ` +
              `Multiple-acquirer or zero-acquirer shapes are not supported in Phase 2A.`,
          )
        }

        const transferorSubjectId = transferors[0].subjectId
        const acquirerSubjectId = acquirers[0].subjectId

        if (!transferorSubjectId) {
          throw new Error(
            'SHARE_TRANSFER: TRANSFEROR participant has no resolved subjectId. ' +
              'Future subjects are not supported as transferors in Phase 2A.',
          )
        }
        if (!acquirerSubjectId) {
          throw new Error(
            'SHARE_TRANSFER: ACQUIRER participant has no resolved subjectId. ' +
              'Future subjects are not supported as acquirers in Phase 2A.',
          )
        }

        // Exactly one active SHAREHOLDER relation must exist for the transferor → company.
        const transferorRelations = await tx
          .select({ id: relationsTable.id })
          .from(relationsTable)
          .where(
            and(
              eq(relationsTable.subjectAId, transferorSubjectId),
              eq(relationsTable.subjectBId, action.targetSubjectId),
              eq(relationsTable.relationType, 'SHAREHOLDER'),
              eq(relationsTable.isActive, true),
            ),
          )

        if (transferorRelations.length === 0) {
          throw new Error(
            `SHARE_TRANSFER: no active SHAREHOLDER relation found for transferor ` +
              `${transferorSubjectId} → company ${action.targetSubjectId}. ` +
              `Was the relation ever created, or has it already been terminated?`,
          )
        }
        if (transferorRelations.length > 1) {
          throw new Error(
            `SHARE_TRANSFER: ${transferorRelations.length} active SHAREHOLDER relations found for ` +
              `transferor ${transferorSubjectId} → company ${action.targetSubjectId}. ` +
              `Expected exactly 1. The data is in an inconsistent state.`,
          )
        }

        // Terminate the transferor's existing SHAREHOLDER relation.
        await terminateRelationInTx(tx, {
          relationId: transferorRelations[0].id,
          triggeredByOrderId: orderId,
          terminatedBy: completedBy,
        })

        // Create the acquirer's new SHAREHOLDER relation.
        // resultingRelationId points to the newly created relation.
        resultingRelationId = await createRelationInTx(tx, {
          subjectAId: acquirerSubjectId,
          subjectBId: action.targetSubjectId,
          relationType: 'SHAREHOLDER',
          validFrom: now.toISOString(),
          sharePercentage,
          triggeredByOrderId: orderId,
          createdBy: completedBy,
        })

      } else if (
        action.actionType === 'ADDRESS_CHANGE' ||
        action.actionType === 'NAME_CHANGE' ||
        action.actionType === 'STATUTORY_REP_CHANGE' ||
        action.actionType === 'CAPITAL_CHANGE' ||
        action.actionType === 'OTHER'
      ) {
        // ── Documented-only actions ──────────────────────────────────
        // No relation mutation. JSONB old/newValue is the full record.
        resultingRelationId = null

      } else {
        // Exhaustive guard — fail loudly if a new action type is added to
        // CHANGE_ACTION_TYPES without adding a branch here.
        throw new Error(
          `Unhandled action type: "${action.actionType}". ` +
            `Add a branch to applyOrderChangeActionsToRelationsInTx in completion.ts.`,
        )
      }
    } catch (err) {
      // Re-throw with action context — caller sees which action caused the rollback.
      const detail = err instanceof Error ? err.message : 'Unknown error'
      throw new Error(
        `Order completion failed at action ${action.actionType} (id: ${action.id}): ${detail}`,
      )
    }

    // Mark action APPLIED inside the same transaction.
    await tx
      .update(orderChangeActions)
      .set({
        status: 'APPLIED',
        appliedAt: now,
        resultingRelationId,
        updatedAt: now,
      })
      .where(eq(orderChangeActions.id, action.id))

    // Audit log entry for this action's apply event.
    await tx.insert(auditLog).values({
      entityType: 'order_change_action',
      entityId: action.id,
      action: 'CHANGE_ACTION_APPLIED',
      diff: {
        actionType: action.actionType,
        orderId,
        resultingRelationId,
        appliedDuringCompletion: true,
      },
      userId: completedBy,
    })
  }
}

// ── runCompletionHookInTx ──────────────────────────────────────────
// Routes completion-time relation mutations by order type.
// Called by updateOrderStatus inside the COMPLETED transition transaction.
// Any failure throws — rolling back the entire status change.
//
// COMPANY_FORMATION → applyParticipantGeneratedRelationsInTx
// COMPANY_CHANGE    → applyOrderChangeActionsToRelationsInTx
//   (covers COMPANY_CHANGE_NOTARY and COMPANY_CHANGE_COURT business variants)
// All other types   → no relation side effects in Phase 1/2A

export async function runCompletionHookInTx(
  tx: DbTx,
  orderId: string,
  completedBy: string | null,
  now: Date,
): Promise<void> {
  const orderRows = await tx
    .select({ orderType: orders.orderType })
    .from(orders)
    .where(eq(orders.id, orderId))

  if (!orderRows[0]) return

  const { orderType } = orderRows[0]

  if (orderType === 'COMPANY_FORMATION') {
    await applyParticipantGeneratedRelationsInTx(tx, orderId, completedBy, now)
  } else if (orderType === 'COMPANY_CHANGE') {
    await applyOrderChangeActionsToRelationsInTx(tx, orderId, completedBy, now)
  }
  // SHELF_PURCHASE, VAT_REGISTRATION, REGISTERED_OFFICE, ACCOUNTING, OTHER:
  // no automated relation side effects in Phase 1/2A.
}
