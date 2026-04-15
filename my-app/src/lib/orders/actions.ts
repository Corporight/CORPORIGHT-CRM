'use server'

// Order server actions — createOrder, addOrderParticipant, listOrders, updateOrderStatus.
//
// Invariants enforced here (CLAUDE.md):
//   - order_items are read-only once orders.confirmed_at is set
//   - client_subject_id is a cache — never treated as authoritative participant
//   - future_subjects rows are never deleted
//   - order_participants subject XOR future_subject is validated at both app and DB layer
//
// AML enforcement (see src/lib/aml/enforcement.ts for full documentation):
//   - createOrder: warns on incomplete AML; blocks REJECTED clients; requires override for HIGH risk
//   - updateOrderStatus: blocks transition to DOCUMENT_PREPARATION and EXECUTION without COMPLETED KYC

import { db } from '@/db'
import {
  orders,
  orderItems,
  orderParticipants,
  futureSubjects,
  orderChangeActions,
  companiesForSale,
  subjects,
  auditLog,
} from '@/db/schema'
import { eq, ilike, and, isNull, sql } from 'drizzle-orm'
import {
  createOrderSchema,
  addOrderParticipantSchema,
  listOrdersQuerySchema,
  updateOrderStatusSchema,
  type CreateOrderInput,
  type AddOrderParticipantInput,
  type ListOrdersQueryInput,
  type UpdateOrderStatusInput,
} from './validators'
import {
  evaluateAmlForOrderCreation,
  evaluateAmlForOrderProgression,
} from '@/lib/aml/enforcement'
import type { OrderStatus } from '@/db/schema'

// ── Result type ────────────────────────────────────────────────────

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// ── Order number generation ────────────────────────────────────────
// Generates ORD-YYYY-NNNN by counting existing orders in the current year.
// Phase 1 simplification: uses COUNT within a transaction to avoid a separate
// sequence object. Acceptable for low-concurrency internal use.
// If contention becomes an issue, replace with a PostgreSQL sequence.
async function generateOrderNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `ORD-${year}-`

  const [{ count }] = await tx
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(ilike(orders.number, `${prefix}%`))

  const seq = String(count + 1).padStart(4, '0')
  return `${prefix}${seq}`
}

// ── Valid status transitions ────────────────────────────────────────
// Defines the permitted state machine moves for orders.
// Attempting any other transition is rejected before AML is even checked.
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CONCEPT:                ['WAITING_FOR_PAYMENT', 'DOCUMENT_PREPARATION', 'CANCELLED'],
  WAITING_FOR_PAYMENT:    ['DOCUMENT_PREPARATION', 'CANCELLED'],
  DOCUMENT_PREPARATION:   ['WAITING_FOR_DOCUMENTS', 'CANCELLED'],
  WAITING_FOR_DOCUMENTS:  ['EXECUTION', 'CANCELLED'],
  EXECUTION:              ['COMPLETED', 'CANCELLED'],
  COMPLETED:              [],
  CANCELLED:              [],
}

// ── createOrder ────────────────────────────────────────────────────

export async function createOrder(
  input: CreateOrderInput,
): Promise<ActionResult<{ id: string; number: string; status: string; amlWarning?: string }>> {
  const parsed = createOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { orderType, clientSubjectId, companyForSaleId, assignedTo, dueDate, notes, amlOverride } = parsed.data

  let amlWarning: string | undefined

  // Validate companyForSaleId if provided: record must exist.
  // Status is NOT checked here — reservation is a separate explicit step.
  if (companyForSaleId) {
    const cfs = await db.query.companiesForSale.findFirst({
      where: eq(companiesForSale.id, companyForSaleId),
      columns: { id: true },
    })
    if (!cfs) {
      return { success: false, error: `Company-for-sale record not found: ${companyForSaleId}` }
    }
  }

  // Subject existence + active check, then AML evaluation.
  if (clientSubjectId) {
    const subject = await db.query.subjects.findFirst({
      where: eq(subjects.id, clientSubjectId),
      columns: { id: true, isActive: true },
    })
    if (!subject) {
      return { success: false, error: 'Client subject not found.' }
    }
    if (!subject.isActive) {
      return { success: false, error: 'Client subject is inactive.' }
    }

    // AML check — see src/lib/aml/enforcement.ts for decision logic.
    const amlDecision = await evaluateAmlForOrderCreation(clientSubjectId, amlOverride ?? false)

    if (amlDecision.decision === 'BLOCK') {
      return { success: false, error: amlDecision.reason }
    }
    if (amlDecision.decision === 'REQUIRE_OVERRIDE') {
      return { success: false, error: amlDecision.warning }
    }
    if (amlDecision.decision === 'ALLOW_WITH_WARNING') {
      amlWarning = amlDecision.warning
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const number = await generateOrderNumber(tx)

      const [order] = await tx
        .insert(orders)
        .values({
          number,
          orderType,
          status: 'CONCEPT',
          clientSubjectId: clientSubjectId ?? null,
          companyForSaleId: companyForSaleId ?? null,
          assignedTo: assignedTo ?? null,
          dueDate: dueDate ?? null,
          notes: notes ?? null,
        })
        .returning({
          id: orders.id,
          number: orders.number,
          status: orders.status,
        })

      // Persist audit row for order creation.
      await tx.insert(auditLog).values({
        entityType: 'order',
        entityId: order.id,
        action: 'ORDER_CREATED',
        diff: {
          orderType,
          number,
          clientSubjectId: clientSubjectId ?? null,
          companyForSaleId: companyForSaleId ?? null,
        },
      })

      // If an AML override was accepted, persist that decision.
      // The enforcement module also logs to console; this ensures the override
      // is recorded in the audit trail and associated with the order.
      if (clientSubjectId && amlOverride === true) {
        await tx.insert(auditLog).values({
          entityType: 'order',
          entityId: order.id,
          action: 'AML_OVERRIDE_PASSED',
          diff: { subjectId: clientSubjectId },
        })
      }

      return order
    })

    return { success: true, data: { ...result, amlWarning } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('unique') && message.includes('number')) {
      return { success: false, error: 'Order number conflict — please retry.' }
    }
    return { success: false, error: message }
  }
}

// ── updateOrderStatus ──────────────────────────────────────────────
// Transitions an order through the defined state machine.
// AML is enforced before DOCUMENT_PREPARATION and EXECUTION.
// The authoritative client for AML lookup is client_subject_id (the cache field).
// In Phase 2 this should resolve the client from order_participants instead.

export async function updateOrderStatus(
  input: UpdateOrderStatusInput,
): Promise<ActionResult<{ id: string; status: string }>> {
  const parsed = updateOrderStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { orderId, newStatus } = parsed.data

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { id: true, status: true, clientSubjectId: true },
  })

  if (!order) {
    return { success: false, error: 'Order not found.' }
  }

  // Validate the transition against the state machine.
  const allowed = VALID_TRANSITIONS[order.status as OrderStatus] ?? []
  if (!allowed.includes(newStatus as OrderStatus)) {
    return {
      success: false,
      error: `Invalid status transition: ${order.status} → ${newStatus}. ` +
        `Allowed: ${allowed.length > 0 ? allowed.join(', ') : 'none'}.`,
    }
  }

  // AML gate: block DOCUMENT_PREPARATION and EXECUTION without completed KYC.
  // Uses client_subject_id as the AML subject in Phase 1.
  // TODO Phase 2: resolve client from order_participants WHERE role_code = 'CLIENT'.
  if (order.clientSubjectId) {
    const amlDecision = await evaluateAmlForOrderProgression(
      order.clientSubjectId,
      newStatus as OrderStatus,
    )
    if (amlDecision.decision === 'BLOCK') {
      return { success: false, error: amlDecision.reason }
    }
  }

  // ── Completion guards ──────────────────────────────────────────────
  // Before allowing COMPLETED, verify the order's legal execution is complete.
  if (newStatus === 'COMPLETED') {
    // Guard 1: all future_subjects for this order must be resolved.
    // An unresolved future subject means a legal entity was never created —
    // completing the order would leave the company formation incomplete.
    const unresolvedFutureSubjects = await db
      .select({ id: futureSubjects.id, intendedName: futureSubjects.intendedName })
      .from(futureSubjects)
      .where(
        and(
          eq(futureSubjects.orderId, orderId),
          isNull(futureSubjects.resolvedSubjectId),
        ),
      )

    if (unresolvedFutureSubjects.length > 0) {
      const names = unresolvedFutureSubjects
        .map((fs) => fs.intendedName ?? fs.id)
        .join(', ')
      return {
        success: false,
        error:
          `Cannot complete order: ${unresolvedFutureSubjects.length} future subject(s) ` +
          `are not yet resolved: ${names}. ` +
          `Resolve them first via resolveFutureSubject().`,
      }
    }

    // Guard 2: all order_change_actions must be APPLIED or CANCELLED.
    // A PENDING action means a legal mutation (director appointment, share transfer, etc.)
    // has been recorded as intended but not yet executed against the relations table.
    const pendingActions = await db
      .select({ id: orderChangeActions.id, actionType: orderChangeActions.actionType })
      .from(orderChangeActions)
      .where(
        and(
          eq(orderChangeActions.orderId, orderId),
          eq(orderChangeActions.status, 'PENDING'),
        ),
      )

    if (pendingActions.length > 0) {
      const types = pendingActions.map((a) => a.actionType).join(', ')
      return {
        success: false,
        error:
          `Cannot complete order: ${pendingActions.length} change action(s) are still PENDING: ` +
          `${types}. Apply or cancel them first via applyOrderChangeActionsForOrder().`,
      }
    }
  }

  try {
    const now = new Date()

    const [updated] = await db.transaction(async (tx) => {
      const rows = await tx
        .update(orders)
        .set({
          status: newStatus,
          updatedAt: now,
          // Record terminal timestamps when relevant.
          ...(newStatus === 'COMPLETED' ? { completedAt: now } : {}),
          ...(newStatus === 'CANCELLED' ? { cancelledAt: now } : {}),
        })
        .where(eq(orders.id, orderId))
        .returning({ id: orders.id, status: orders.status })

      await tx.insert(auditLog).values({
        entityType: 'order',
        entityId: orderId,
        action: 'ORDER_STATUS_CHANGED',
        diff: { from: order.status, to: newStatus },
      })

      return rows
    })

    return { success: true, data: updated }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── addOrderParticipant ────────────────────────────────────────────

export async function addOrderParticipant(
  input: AddOrderParticipantInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = addOrderParticipantSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { orderId, subjectId, futureSubjectId, roleCode, sharePercentage, participantContextType, notes } =
    parsed.data

  // Verify order exists and is not completed/cancelled.
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
      error: `Cannot add participants to a ${order.status} order.`,
    }
  }

  // Verify the referenced subject or future subject exists.
  if (subjectId) {
    const subject = await db.query.subjects.findFirst({
      where: eq(subjects.id, subjectId),
      columns: { id: true },
    })
    if (!subject) {
      return { success: false, error: 'Subject not found.' }
    }
  }

  if (futureSubjectId) {
    const fs = await db.query.futureSubjects.findFirst({
      where: eq(futureSubjects.id, futureSubjectId),
      columns: { id: true },
    })
    if (!fs) {
      return { success: false, error: 'Future subject not found.' }
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [participant] = await tx
        .insert(orderParticipants)
        .values({
          orderId,
          subjectId: subjectId ?? null,
          futureSubjectId: futureSubjectId ?? null,
          roleCode,
          sharePercentage: sharePercentage != null ? String(sharePercentage) : null,
          participantContextType: participantContextType ?? null,
          notes: notes ?? null,
        })
        .returning({ id: orderParticipants.id })

      await tx.insert(auditLog).values({
        entityType: 'order_participant',
        entityId: participant.id,
        action: 'PARTICIPANT_ADDED',
        diff: {
          orderId,
          roleCode,
          subjectId: subjectId ?? null,
          futureSubjectId: futureSubjectId ?? null,
        },
      })

      return participant
    })

    return { success: true, data: result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── listOrders ─────────────────────────────────────────────────────

export type OrderListItem = {
  id: string
  number: string
  orderType: string
  status: string
  clientSubjectId: string | null
  assignedTo: string | null
  dueDate: string | null
  confirmedAt: Date | null
  createdAt: Date
}

export async function listOrders(
  query: ListOrdersQueryInput = {},
): Promise<ActionResult<{ items: OrderListItem[]; total: number }>> {
  const parsed = listOrdersQuerySchema.safeParse(query)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { status, orderType, clientSubjectId, assignedTo, search, limit, offset } = parsed.data

  const conditions = []

  if (status) conditions.push(eq(orders.status, status))
  if (orderType) conditions.push(eq(orders.orderType, orderType))
  if (clientSubjectId) conditions.push(eq(orders.clientSubjectId, clientSubjectId))
  if (assignedTo) conditions.push(eq(orders.assignedTo, assignedTo))
  if (search) conditions.push(ilike(orders.number, `%${search}%`))

  const where = conditions.length > 0 ? and(...conditions) : undefined

  try {
    const [items, countRows] = await Promise.all([
      db
        .select({
          id: orders.id,
          number: orders.number,
          orderType: orders.orderType,
          status: orders.status,
          clientSubjectId: orders.clientSubjectId,
          assignedTo: orders.assignedTo,
          dueDate: orders.dueDate,
          confirmedAt: orders.confirmedAt,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(where)
        .orderBy(orders.createdAt)
        .limit(limit)
        .offset(offset),

      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(orders)
        .where(where),
    ])

    return { success: true, data: { items, total: countRows[0].count } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
