// helpers.ts — internal finance helpers
//
// These functions are called INSIDE db.transaction() callbacks by actions.ts.
// They are not exported as Server Actions — do not add 'use server' here.
//
// Decimal arithmetic: all NUMERIC columns return as strings from Drizzle.
// toScaled() converts to integer cents to avoid floating-point comparison errors.

import { db } from '@/db'
import {
  paymentGroups,
  paymentAllocations,
  orderItems,
} from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'

// ── Tx type ────────────────────────────────────────────────────────
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// ── PaymentStatus ──────────────────────────────────────────────────
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID'

// ── Internal decimal utility ───────────────────────────────────────
function toScaled(amount: string | null | undefined): number {
  return Math.round(parseFloat(amount ?? '0') * 100)
}

// ── computeOrderPaymentStatus ──────────────────────────────────────
// Pure function — no DB access.
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
// Updates the payment_group row and increments version.
// Callers must hold a SELECT FOR UPDATE lock on the payment_group row.
export async function recalculatePaymentGroupAllocationState(
  tx: Tx,
  paymentGroupId: string,
): Promise<{ allocatedAmount: string; processingStatus: string }> {
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
