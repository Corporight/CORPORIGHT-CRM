'use server'

// Order change actions service — createOrderChangeAction, listOrderChangeActionsForOrder.
//
// Change actions describe the LEGAL INTENT of a COMPANY_CHANGE or SHELF_PURCHASE order.
// They are created manually by operators before execution.
//
// Relation mutations at apply time (Relations Phase 2A):
//   Apply logic has moved to applyOrderChangeActionsToRelationsInTx in completion.ts.
//   It is invoked automatically when the order is completed (EXECUTION → COMPLETED).
//   applyOrderChangeActionsForOrder() in this file is deprecated and returns an error.
//
// JSONB payload conventions (informational — apply logic reads these in completion.ts):
//   DIRECTOR_APPOINTMENT  newValue: { subjectId: uuid }   // the appointee (person)
//   DIRECTOR_REMOVAL      oldValue: { subjectId: uuid }   // the removed director (person)
//   SHARE_TRANSFER        subjects resolved from order_participants (TRANSFEROR / ACQUIRER)
//                         sharePercentage read from order_change_actions.share_percentage column
//   Others: old/newValue are informational; structure is free-form.
//
// targetSubjectId convention:
//   For relation-mutating actions: always the COMPANY being modified.
//   For others: the primary subject affected (company or person).

import { db } from '@/db'
import {
  orders,
  orderChangeActions,
  subjects,
  auditLog,
  CHANGE_ACTION_TYPES,
} from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

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

// ── createOrderChangeAction ────────────────────────────────────────
// Records a legal mutation INTENT on an order. Does NOT execute any relation
// changes — those happen automatically at order completion via completion.ts.
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
// @deprecated Relations Phase 2A.
// Change-action relation mutations now happen automatically inside the order
// completion transaction via applyOrderChangeActionsToRelationsInTx
// in src/lib/orders/completion.ts.
// Call updateOrderStatus({ orderId, newStatus: 'COMPLETED' }) instead.
// This function is retained for reference; its body returns a deprecation error.

export type ApplyActionsResult = {
  applied: number
}

export async function applyOrderChangeActionsForOrder(
  input: ApplyOrderChangeActionsInput,
): Promise<ActionResult<ApplyActionsResult>> {
  const parsed = applyOrderChangeActionsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  return {
    success: false,
    error:
      'applyOrderChangeActionsForOrder is deprecated (Relations Phase 2A). ' +
      'Relation mutations are now applied automatically when completing the order. ' +
      'Call updateOrderStatus({ orderId, newStatus: "COMPLETED" }) instead.',
  }
}
