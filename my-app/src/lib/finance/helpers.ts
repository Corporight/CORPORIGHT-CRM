// helpers.ts — internal finance helpers
//
// These functions are called INSIDE db.transaction() callbacks by actions.ts.
// They are not exported as Server Actions — do not add 'use server' here.
//
// Tx type: the transaction client passed to a db.transaction() callback.
//
// Decimal arithmetic: all NUMERIC columns return as strings from Drizzle.
// toScaled() converts to integer cents to avoid floating-point comparison errors.
// Safe for amounts up to ~90 trillion (below Number.MAX_SAFE_INTEGER / 100).

import { db } from '@/db'
import {
  paymentGroups,
  paymentAllocations,
  orderItems,
} from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'

// ── Tx type ────────────────────────────────────────────────────────
// The transaction argument passed to db.transaction(async (tx) => { ... }).
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// ── PaymentStatus ──────────────────────────────────────────────────
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID'

// ── Internal decimal utility ───────────────────────────────────────
// Converts a decimal string to scaled integer (cents). Rounds to 2dp.
function toScaled(amount: string | null | undefined): number {
  return Math.round(parseFloat(amount ?? '0') * 100)
}

// ── computeOrderPaymentStatus ──────────────────────────────────────
// Pure function — no DB access.
//
// Rules:
//   allocated = 0              → UNPAID
//   0 < allocated < total      → PARTIALLY_PAID
//   allocated = total          → PAID
//   allocated > total          → OVERPAID
//
// Phase 1 note: orderTotal is computed from live order_items.
// Phase 2: switch to reading from orders.snapshot after confirmation.
export function computeOrderPaymentStatus(
  allocatedAmount: string,
  orderTotal: string,
): PaymentStatus {
  const allocated = toScaled(allocatedAmount)
  const total = toScaled(orderTotal)
  if (allocated === 0) return 'UNPAID'
  if (allocated < total) return 'PARTIALLY_PAID'
  if (allocated === total) return 'PAID'
  return 'OVERPAID'
}

// ── computeOrderTotal ──────────────────────────────────────────────
// Sums order_items.total_price for the order.
// Phase 1: reads live order_items regardless of confirmation status.
// Returns '0' if no items exist.
export async function computeOrderTotal(tx: Tx, orderId: string): Promise<string> {
  const [result] = await tx
    .select({
      total: sql<string>`coalesce(sum(${orderItems.totalPrice})::text, '0')`,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
  return result?.total ?? '0'
}

// ── recalculateOrderPaymentStatus ──────────────────────────────────
// Computes the current payment status for an order from ACTIVE allocations.
// Does not write anything — caller decides whether to audit a transition.
export async function recalculateOrderPaymentStatus(
  tx: Tx,
  orderId: string,
): Promise<PaymentStatus> {
  const [allocationResult] = await tx
    .select({
      total: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmount})::text, '0')`,
    })
    .from(paymentAllocations)
    .where(
      and(
        eq(paymentAllocations.orderId, orderId),
        eq(paymentAllocations.status, 'ACTIVE'),
      ),
    )
  const allocated = allocationResult?.total ?? '0'
  const orderTotal = await computeOrderTotal(tx, orderId)
  return computeOrderPaymentStatus(allocated, orderTotal)
}

// ── recalculatePaymentGroupAllocationState ─────────────────────────
// Recomputes allocated_amount and processing_status from ACTIVE allocations.
// Updates the payment_group row. Increments version.
//
// processing_status rules:
//   allocated = 0              → NEW
//   0 < allocated < total      → PARTIALLY_ALLOCATED
//   allocated >= total         → FULLY_ALLOCATED
//
// Callers must have already acquired a SELECT FOR UPDATE lock on the
// payment_group row before calling this function.
export async function recalculatePaymentGroupAllocationState(
  tx: Tx,
  paymentGroupId: string,
): Promise<{ allocatedAmount: string; processingStatus: string }> {
  // Re-read totalAmount (safe — caller holds FOR UPDATE lock).
  const [pg] = await tx
    .select({ totalAmount: paymentGroups.totalAmount })
    .from(paymentGroups)
    .where(eq(paymentGroups.id, paymentGroupId))

  if (!pg) {
    throw new Error(`Payment group not found during recalculation: ${paymentGroupId}`)
  }

  const [allocationResult] = await tx
    .select({
      total: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmount})::text, '0')`,
    })
    .from(paymentAllocations)
    .where(
      and(
        eq(paymentAllocations.paymentGroupId, paymentGroupId),
        eq(paymentAllocations.status, 'ACTIVE'),
      ),
    )

  const allocatedAmount = allocationResult?.total ?? '0'
  const allocated = toScaled(allocatedAmount)
  const total = toScaled(pg.totalAmount)

  let processingStatus: string
  if (allocated === 0) {
    processingStatus = 'NEW'
  } else if (allocated < total) {
    processingStatus = 'PARTIALLY_ALLOCATED'
  } else {
    processingStatus = 'FULLY_ALLOCATED'
  }

  await tx
    .update(paymentGroups)
    .set({
      allocatedAmount,
      processingStatus,
      version: sql`${paymentGroups.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(paymentGroups.id, paymentGroupId))

  return { allocatedAmount, processingStatus }
}
