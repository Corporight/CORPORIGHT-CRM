// Order completion hooks — type-specific side effects run atomically inside
// the updateOrderStatus transaction when newStatus = COMPLETED.
//
// A failure here rolls back the status change entirely — no partial state.
// The hook receives the already-open tx so all writes share one commit.
//
// COMPANY_FORMATION: for every eligible order participant (generates_relation=true,
// participantContextType != SIGNER), creates a relation to the resolved company.
// Requires exactly one resolved company future subject — zero or multiple is a
// hard failure, not a silent no-op.

import { eq, and, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { orders, orderParticipants, futureSubjects, roleDefinitions } from '@/db/schema'
import { createRelationInTx } from '@/lib/relations/actions'

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function runCompletionHookInTx(
  tx: DbTx,
  orderId: string,
  completedBy: string | null,
  now: Date,
): Promise<void> {
  // Only COMPANY_FORMATION triggers the participant-to-relation hook.
  // COMPANY_CHANGE uses order_change_actions instead.
  const orderRows = await tx
    .select({ orderType: orders.orderType })
    .from(orders)
    .where(eq(orders.id, orderId))

  if (!orderRows[0] || orderRows[0].orderType !== 'COMPANY_FORMATION') return

  // Find the company being formed — must be exactly one.
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

  // The existing completion guard (future_subjects unresolved check) already ensures
  // resolvedSubjectId is non-null for future subjects belonging to this order.
  // Explicit null-check here for correctness.
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
  // If a roleCode is not in role_definitions, it is treated as generates_relation=false.
  const roleCodes = [...new Set(participants.map((p) => p.roleCode))]
  const roleRows = await tx
    .select({ code: roleDefinitions.code, generatesRelation: roleDefinitions.generatesRelation })
    .from(roleDefinitions)
    .where(inArray(roleDefinitions.code, roleCodes))
  const roleMap = new Map(roleRows.map((r) => [r.code, r.generatesRelation]))

  // Resolve futureSubjectId participants to their real subject IDs.
  // The completion guard ensures all futureSubjects linked to THIS order are resolved,
  // but cannot guarantee resolution of futureSubjects from other orders.
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
  // Sequential awaits — Promise.all is unsafe inside a postgres-js transaction
  // (concurrent queries on a single connection cause protocol interleaving).
  for (const participant of participants) {
    // SIGNER participants are signing documents, not being structurally appointed.
    if (participant.participantContextType === 'SIGNER') continue

    // Skip if role is absent from role_definitions or has generates_relation=false.
    if (roleMap.get(participant.roleCode) !== true) continue

    // Resolve effective subjectId — direct, or via resolved futureSubject.
    const participantSubjectId =
      participant.subjectId ??
      (participant.futureSubjectId
        ? (futureResolutionMap.get(participant.futureSubjectId) ?? null)
        : null)

    // Eligible participant with unresolvable subject is a hard failure.
    // Silent skip would create a relation gap in the legal record.
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
