'use server'

// Order change actions service — createOrderChangeAction, listOrderChangeActionsForOrder,
// applyOrderChangeActionsForOrder.
//
// Change actions describe the LEGAL INTENT of an order — what mutations will happen
// when the order is executed. They are created manually by operators before execution,
// then applied (individually or all at once) during/after the EXECUTION phase.
//
// Supported order types for change actions: COMPANY_CHANGE, SHELF_PURCHASE.
//
// Apply logic per action type:
//   DIRECTOR_APPOINTMENT  → creates a DIRECTOR relation (person → company)
//   DIRECTOR_REMOVAL      → terminates the active DIRECTOR relation (person → company)
//   SHARE_TRANSFER        → terminates old SHAREHOLDER relation + creates new one
//   ADDRESS_CHANGE        → documented only; no relation mutation
//   NAME_CHANGE           → documented only; no relation mutation
//   STATUTORY_REP_CHANGE  → documented only; no relation mutation
//   CAPITAL_CHANGE        → documented only; no relation mutation
//   OTHER                 → documented only; no relation mutation
//
// JSONB payload conventions (enforced at apply time):
//   DIRECTOR_APPOINTMENT  newValue: { subjectId: uuid }   // the appointee (person)
//   DIRECTOR_REMOVAL      oldValue: { subjectId: uuid }   // the removed director (person)
//   SHARE_TRANSFER        oldValue: { subjectId: uuid, sharePercentage?: string }  // transferor
//                         newValue: { subjectId: uuid, sharePercentage?: string }  // acquirer
//   Others: old/newValue are informational; structure is free-form.
//
// targetSubjectId convention:
//   For relation-mutating actions: always the COMPANY being modified.
//   For others: the primary subject affected (company or person).

import { db } from '@/db'
import {
  orders,
  orderChangeActions,
  relations as relationsTable,
  subjects,
  auditLog,
  CHANGE_ACTION_TYPES,
} from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import {
  createRelationInTx,
  terminateRelationInTx,
} from '@/lib/relations/actions'

// ── Result type ────────────────────────────────────────────────────

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// ── Order types that permit change actions ─────────────────────────
const CHANGE_ACTION_ORDER_TYPES = ['COMPANY_CHANGE', 'SHELF_PURCHASE'] as const
type ChangeActionOrderType = (typeof CHANGE_ACTION_ORDER_TYPES)[number]

function isChangeActionOrderType(t: string): t is ChangeActionOrderType {
  return CHANGE_ACTION_ORDER_TYPES.includes(t as ChangeActionOrderType)
}

// ── Validators ──────────────────────────────────────────────────────

const createOrderChangeActionSchema = z.object({
  orderId: z.string().uuid(),
  actionType: z.enum(CHANGE_ACTION_TYPES),
  // For relation-mutating actions: the company being modified.
  targetSubjectId: z.string().uuid().optional(),
  // JSONB snapshot of the state before the change. Shape varies by actionType — see file header.
  oldValue: z.record(z.string(), z.unknown()).optional(),
  // JSONB snapshot of the intended state after the change. Shape varies by actionType.
  newValue: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
  createdBy: z.string().uuid().optional(),
})

const applyOrderChangeActionsSchema = z.object({
  orderId: z.string().uuid(),
  appliedBy: z.string().uuid().optional(),
})

export type CreateOrderChangeActionInput = z.input<typeof createOrderChangeActionSchema>
export type ApplyOrderChangeActionsInput = z.input<typeof applyOrderChangeActionsSchema>

// ── JSONB payload schemas (validated at apply time) ─────────────────

// DIRECTOR_APPOINTMENT: who is being appointed
const appointmentNewValue = z.object({
  subjectId: z.string().uuid('DIRECTOR_APPOINTMENT.newValue.subjectId must be a UUID'),
})

// DIRECTOR_REMOVAL: who is being removed
const removalOldValue = z.object({
  subjectId: z.string().uuid('DIRECTOR_REMOVAL.oldValue.subjectId must be a UUID'),
})

// SHARE_TRANSFER: transferor side
const shareTransferOld = z.object({
  subjectId: z.string().uuid('SHARE_TRANSFER.oldValue.subjectId must be a UUID'),
  sharePercentage: z.string().optional(),
})

// SHARE_TRANSFER: acquirer side
const shareTransferNew = z.object({
  subjectId: z.string().uuid('SHARE_TRANSFER.newValue.subjectId must be a UUID'),
  sharePercentage: z.string().optional(),
})

// ── createOrderChangeAction ────────────────────────────────────────
// Records a legal mutation INTENT on an order. Does NOT execute any relation
// changes — that happens in applyOrderChangeActionsForOrder.
//
// Permitted only for COMPANY_CHANGE and SHELF_PURCHASE orders.
// Blocked once the order is COMPLETED or CANCELLED.

export async function createOrderChangeAction(
  input: CreateOrderChangeActionInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createOrderChangeActionSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { orderId, actionType, targetSubjectId, oldValue, newValue, notes, createdBy } =
    parsed.data

  // Verify order: must exist, be of the right type, and be open.
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { id: true, status: true, orderType: true },
  })
  if (!order) {
    return { success: false, error: 'Order not found.' }
  }
  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
    return {
      success: false,
      error: `Cannot add change actions to a ${order.status} order.`,
    }
  }
  if (!isChangeActionOrderType(order.orderType)) {
    return {
      success: false,
      error:
        `Change actions are only permitted for order types: ` +
        `${CHANGE_ACTION_ORDER_TYPES.join(', ')}. This order is: ${order.orderType}.`,
    }
  }

  // Verify target subject exists (if provided).
  if (targetSubjectId) {
    const target = await db.query.subjects.findFirst({
      where: eq(subjects.id, targetSubjectId),
      columns: { id: true },
    })
    if (!target) {
      return { success: false, error: `Target subject not found: ${targetSubjectId}` }
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [action] = await tx
        .insert(orderChangeActions)
        .values({
          orderId,
          actionType,
          targetSubjectId: targetSubjectId ?? null,
          oldValue: oldValue ?? null,
          newValue: newValue ?? null,
          status: 'PENDING',
          notes: notes ?? null,
          createdBy: createdBy ?? null,
        })
        .returning({ id: orderChangeActions.id })

      await tx.insert(auditLog).values({
        entityType: 'order_change_action',
        entityId: action.id,
        action: 'CHANGE_ACTION_CREATED',
        diff: {
          orderId,
          actionType,
          targetSubjectId: targetSubjectId ?? null,
        },
        userId: createdBy ?? null,
      })

      return action
    })

    return { success: true, data: { id: result.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── listOrderChangeActionsForOrder ─────────────────────────────────

export type OrderChangeActionItem = {
  id: string
  orderId: string
  actionType: string
  targetSubjectId: string | null
  oldValue: unknown
  newValue: unknown
  status: string
  appliedAt: Date | null
  resultingRelationId: string | null
  notes: string | null
  createdAt: Date
}

export async function listOrderChangeActionsForOrder(
  orderId: string,
): Promise<ActionResult<{ items: OrderChangeActionItem[] }>> {
  if (!orderId || typeof orderId !== 'string') {
    return { success: false, error: 'orderId is required.' }
  }

  // Verify order exists.
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { id: true },
  })
  if (!order) {
    return { success: false, error: 'Order not found.' }
  }

  try {
    const items = await db
      .select({
        id: orderChangeActions.id,
        orderId: orderChangeActions.orderId,
        actionType: orderChangeActions.actionType,
        targetSubjectId: orderChangeActions.targetSubjectId,
        oldValue: orderChangeActions.oldValue,
        newValue: orderChangeActions.newValue,
        status: orderChangeActions.status,
        appliedAt: orderChangeActions.appliedAt,
        resultingRelationId: orderChangeActions.resultingRelationId,
        notes: orderChangeActions.notes,
        createdAt: orderChangeActions.createdAt,
      })
      .from(orderChangeActions)
      .where(eq(orderChangeActions.orderId, orderId))
      .orderBy(orderChangeActions.createdAt)

    return { success: true, data: { items } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── applyOrderChangeActionsForOrder ────────────────────────────────
// Applies ALL PENDING change actions for an order in a single transaction.
//
// Atomicity guarantee:
//   Either every pending action is applied and every resulting relation
//   mutation is committed, or nothing changes. A failure in any single
//   action rolls back the entire set. This prevents partial legal states
//   such as a director being removed without the replacement being appointed,
//   or a share transfer being half-executed.
//
//   On failure the function returns { success: false, error } identifying
//   which action failed. Fix the data for that action and re-run. Because
//   nothing was committed, re-running is always safe.
//
// Relation-mutating actions (DIRECTOR_APPOINTMENT, DIRECTOR_REMOVAL,
// SHARE_TRANSFER) call createRelationInTx / terminateRelationInTx within
// the shared transaction, which write relation_events and audit_log rows
// as part of the same atomic commit.
//
// Documented-only actions (ADDRESS_CHANGE, NAME_CHANGE, etc.) are marked
// APPLIED with no relation side-effects — old/new JSONB is the full record.
//
// After a successful apply, call updateOrderStatus(COMPLETED). The
// completion guard will verify no PENDING actions remain.

export type ApplyActionsResult = {
  applied: number // equals the number of PENDING actions that existed before the call
}

export async function applyOrderChangeActionsForOrder(
  input: ApplyOrderChangeActionsInput,
): Promise<ActionResult<ApplyActionsResult>> {
  const parsed = applyOrderChangeActionsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { orderId, appliedBy } = parsed.data

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
      error: `Cannot apply change actions to a ${order.status} order.`,
    }
  }

  // Load all PENDING actions, oldest first (insertion order = intended execution order).
  const pending = await db
    .select()
    .from(orderChangeActions)
    .where(
      and(
        eq(orderChangeActions.orderId, orderId),
        eq(orderChangeActions.status, 'PENDING'),
      ),
    )
    .orderBy(orderChangeActions.createdAt)

  if (pending.length === 0) {
    return { success: true, data: { applied: 0 } }
  }

  const now = new Date()

  try {
    // Single transaction — all actions commit together or none do.
    await db.transaction(async (tx) => {
      for (const action of pending) {
        try {
          let resultingRelationId: string | null = null

          // ── Relation-mutating actions ──────────────────────────────

          if (action.actionType === 'DIRECTOR_APPOINTMENT') {
            if (!action.targetSubjectId) {
              throw new Error(
                'DIRECTOR_APPOINTMENT requires targetSubjectId (the company being appointed to).',
              )
            }

            const payloadParsed = appointmentNewValue.safeParse(action.newValue)
            if (!payloadParsed.success) {
              throw new Error(
                `DIRECTOR_APPOINTMENT newValue is invalid: ${payloadParsed.error.issues[0].message}`,
              )
            }

            resultingRelationId = await createRelationInTx(tx, {
              subjectAId: payloadParsed.data.subjectId, // director (person)
              subjectBId: action.targetSubjectId,        // company
              relationType: 'DIRECTOR',
              validFrom: now.toISOString(),
              triggeredByOrderId: orderId,
              createdBy: appliedBy ?? null,
            })
          } else if (action.actionType === 'DIRECTOR_REMOVAL') {
            if (!action.targetSubjectId) {
              throw new Error(
                'DIRECTOR_REMOVAL requires targetSubjectId (the company the director is being removed from).',
              )
            }

            const payloadParsed = removalOldValue.safeParse(action.oldValue)
            if (!payloadParsed.success) {
              throw new Error(
                `DIRECTOR_REMOVAL oldValue is invalid: ${payloadParsed.error.issues[0].message}`,
              )
            }

            // Find the active DIRECTOR relation for this person → company pair.
            const activeRelations = await tx
              .select({ id: relationsTable.id })
              .from(relationsTable)
              .where(
                and(
                  eq(relationsTable.subjectAId, payloadParsed.data.subjectId),
                  eq(relationsTable.subjectBId, action.targetSubjectId),
                  eq(relationsTable.relationType, 'DIRECTOR'),
                  eq(relationsTable.isActive, true),
                ),
              )

            if (activeRelations.length === 0) {
              throw new Error(
                `No active DIRECTOR relation found: ` +
                  `subject ${payloadParsed.data.subjectId} → company ${action.targetSubjectId}. ` +
                  `Was the relation ever created, or has it already been terminated?`,
              )
            }

            resultingRelationId = await terminateRelationInTx(tx, {
              relationId: activeRelations[0].id,
              triggeredByOrderId: orderId,
              terminatedBy: appliedBy ?? null,
            })
          } else if (action.actionType === 'SHARE_TRANSFER') {
            if (!action.targetSubjectId) {
              throw new Error(
                'SHARE_TRANSFER requires targetSubjectId (the company whose shares are being transferred).',
              )
            }

            const oldParsed = shareTransferOld.safeParse(action.oldValue)
            if (!oldParsed.success) {
              throw new Error(
                `SHARE_TRANSFER oldValue is invalid: ${oldParsed.error.issues[0].message}`,
              )
            }
            const newParsed = shareTransferNew.safeParse(action.newValue)
            if (!newParsed.success) {
              throw new Error(
                `SHARE_TRANSFER newValue is invalid: ${newParsed.error.issues[0].message}`,
              )
            }

            // Terminate the transferor's existing SHAREHOLDER relation.
            const transferorRelations = await tx
              .select({ id: relationsTable.id })
              .from(relationsTable)
              .where(
                and(
                  eq(relationsTable.subjectAId, oldParsed.data.subjectId),
                  eq(relationsTable.subjectBId, action.targetSubjectId),
                  eq(relationsTable.relationType, 'SHAREHOLDER'),
                  eq(relationsTable.isActive, true),
                ),
              )

            if (transferorRelations.length === 0) {
              throw new Error(
                `No active SHAREHOLDER relation found for transferor ` +
                  `${oldParsed.data.subjectId} → company ${action.targetSubjectId}. ` +
                  `Was the relation ever created, or has it already been terminated?`,
              )
            }

            await terminateRelationInTx(tx, {
              relationId: transferorRelations[0].id,
              triggeredByOrderId: orderId,
              terminatedBy: appliedBy ?? null,
            })

            // Create the acquirer's new SHAREHOLDER relation.
            const attributes = newParsed.data.sharePercentage
              ? [{ key: 'share_percentage', value: newParsed.data.sharePercentage }]
              : []

            resultingRelationId = await createRelationInTx(tx, {
              subjectAId: newParsed.data.subjectId,  // acquirer
              subjectBId: action.targetSubjectId,     // company
              relationType: 'SHAREHOLDER',
              validFrom: now.toISOString(),
              triggeredByOrderId: orderId,
              createdBy: appliedBy ?? null,
              attributes,
            })

          // ── Documented-only actions (no relation mutation) ───────────

          } else if (
            action.actionType === 'ADDRESS_CHANGE' ||
            action.actionType === 'NAME_CHANGE' ||
            action.actionType === 'STATUTORY_REP_CHANGE' ||
            action.actionType === 'CAPITAL_CHANGE' ||
            action.actionType === 'OTHER'
          ) {
            // oldValue / newValue JSONB is the full record of what changed.
            // No relation rows are created or modified.
            resultingRelationId = null
          } else {
            // Exhaustive guard — should never reach here if CHANGE_ACTION_TYPES is current.
            throw new Error(`Unhandled action type: ${action.actionType}`)
          }

          // Mark action as APPLIED.
          await tx
            .update(orderChangeActions)
            .set({
              status: 'APPLIED',
              appliedAt: now,
              resultingRelationId,
              updatedAt: now,
            })
            .where(eq(orderChangeActions.id, action.id))

          // Audit log for this action's apply event.
          await tx.insert(auditLog).values({
            entityType: 'order_change_action',
            entityId: action.id,
            action: 'CHANGE_ACTION_APPLIED',
            diff: {
              actionType: action.actionType,
              orderId,
              resultingRelationId,
            },
            userId: appliedBy ?? null,
          })
        } catch (err) {
          // Re-throw with action context so the caller knows which action caused the rollback.
          const detail = err instanceof Error ? err.message : 'Unknown error'
          throw new Error(
            `Action ${action.actionType} (id: ${action.id}) failed: ${detail}. ` +
              `All ${pending.length} action(s) have been rolled back. Fix the issue and re-run.`,
          )
        }
      }
    })

    return { success: true, data: { applied: pending.length } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
