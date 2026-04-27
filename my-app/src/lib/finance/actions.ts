'use server'

// Finance service — Phase 1 core.
//
// Public functions:
//   Setup:  createCenter, createFinancialTreeCategory,
//           createFinancialTreeType, createFinancialTreeDetail
//   Core:   createPaymentGroup, createFinancialMovement,
//           createPaymentAllocation, cancelPaymentAllocation
//   Reads:  listPaymentGroups, listFinancialMovements,
//           listAllocationsForOrder, getOrderPaymentStatus,
//           getOrderEconomics
//
// Order payment status is COMPUTED from payment_allocations — never stored
// on the orders table. See helpers.ts for computation logic.
//
// Phase 1 scope limitations:
//   - BANK_IMPORT source rejected at service layer
//   - Only INCOME payment groups accept allocations
//   - Order total from live order_items (Phase 2: switch to orders.snapshot)
//   - vat_registration_id and template_id stored but not FK-validated

import { db } from '@/db'
import {
  centers,
  financialTreeCategories,
  financialTreeTypes,
  financialTreeDetails,
  paymentGroups,
  financialMovements,
  paymentAllocations,
  auditLog,
  orders,
  orderItems,
} from '@/db/schema'
import { eq, and, gte, lte, sql } from 'drizzle-orm'
import {
  createCenterSchema,
  createFinancialTreeCategorySchema,
  createFinancialTreeTypeSchema,
  createFinancialTreeDetailSchema,
  createPaymentGroupSchema,
  createFinancialMovementSchema,
  createPaymentAllocationSchema,
  cancelPaymentAllocationSchema,
  listPaymentGroupsSchema,
  listFinancialMovementsSchema,
  type CreateCenterInput,
  type CreateFinancialTreeCategoryInput,
  type CreateFinancialTreeTypeInput,
  type CreateFinancialTreeDetailInput,
  type CreatePaymentGroupInput,
  type CreateFinancialMovementInput,
  type CreatePaymentAllocationInput,
  type CancelPaymentAllocationInput,
  type ListPaymentGroupsInput,
  type ListFinancialMovementsInput,
} from './validators'
import {
  recalculatePaymentGroupAllocationState,
  recalculateOrderPaymentStatus,
  computeOrderTotal,
  computeOrderPaymentStatus,
  type PaymentStatus,
} from './helpers'

// ── Result type ────────────────────────────────────────────────────

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// ── createCenter ───────────────────────────────────────────────────

export async function createCenter(
  input: CreateCenterInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createCenterSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { code, name, vatMode, isActive, sortOrder } = parsed.data

  try {
    const [record] = await db
      .insert(centers)
      .values({ code, name, vatMode, isActive, sortOrder })
      .returning({ id: centers.id })

    return { success: true, data: { id: record.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('centers_code_unique')) {
      return { success: false, error: `A center with code '${code}' already exists.` }
    }
    return { success: false, error: message }
  }
}

// ── createFinancialTreeCategory ────────────────────────────────────

export async function createFinancialTreeCategory(
  input: CreateFinancialTreeCategoryInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createFinancialTreeCategorySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { code, name, direction, isActive, sortOrder } = parsed.data

  try {
    const [record] = await db
      .insert(financialTreeCategories)
      .values({ code, name, direction, isActive, sortOrder })
      .returning({ id: financialTreeCategories.id })

    return { success: true, data: { id: record.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('financial_tree_categories_code_unique')) {
      return { success: false, error: `A category with code '${code}' already exists.` }
    }
    return { success: false, error: message }
  }
}

// ── createFinancialTreeType ────────────────────────────────────────

export async function createFinancialTreeType(
  input: CreateFinancialTreeTypeInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createFinancialTreeTypeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { code, categoryId, name, isActive, sortOrder } = parsed.data

  const category = await db.query.financialTreeCategories.findFirst({
    where: eq(financialTreeCategories.id, categoryId),
    columns: { id: true },
  })
  if (!category) {
    return { success: false, error: `Financial tree category not found: ${categoryId}` }
  }

  try {
    const [record] = await db
      .insert(financialTreeTypes)
      .values({ code, categoryId, name, isActive, sortOrder })
      .returning({ id: financialTreeTypes.id })

    return { success: true, data: { id: record.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('financial_tree_types_code_unique')) {
      return { success: false, error: `A type with code '${code}' already exists.` }
    }
    return { success: false, error: message }
  }
}

// ── createFinancialTreeDetail ──────────────────────────────────────

export async function createFinancialTreeDetail(
  input: CreateFinancialTreeDetailInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createFinancialTreeDetailSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { code, typeId, name, isActive, sortOrder } = parsed.data

  const type = await db.query.financialTreeTypes.findFirst({
    where: eq(financialTreeTypes.id, typeId),
    columns: { id: true },
  })
  if (!type) {
    return { success: false, error: `Financial tree type not found: ${typeId}` }
  }

  try {
    const [record] = await db
      .insert(financialTreeDetails)
      .values({ code, typeId, name, isActive, sortOrder })
      .returning({ id: financialTreeDetails.id })

    return { success: true, data: { id: record.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('financial_tree_details_code_unique')) {
      return { success: false, error: `A detail with code '${code}' already exists.` }
    }
    return { success: false, error: message }
  }
}

// ── createPaymentGroup ─────────────────────────────────────────────
// Creates a payment event envelope. BANK_IMPORT source is rejected — Phase 2.

export async function createPaymentGroup(
  input: CreatePaymentGroupInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createPaymentGroupSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const {
    centerId, direction, totalAmount, currency, transactionDate,
    counterpartySubjectId, counterpartyName, counterpartyAccountNumber,
    counterpartyBankCode, variableSymbol, constantSymbol, specificSymbol,
    bankReference, source, note, noteInternal, createdBy,
  } = parsed.data

  const center = await db.query.centers.findFirst({
    where: eq(centers.id, centerId),
    columns: { id: true },
  })
  if (!center) {
    return { success: false, error: `Center not found: ${centerId}` }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [record] = await tx
        .insert(paymentGroups)
        .values({
          centerId,
          direction,
          totalAmount,
          allocatedAmount: '0',
          processingStatus: 'NEW',
          currency,
          transactionDate,
          counterpartySubjectId: counterpartySubjectId ?? null,
          counterpartyName: counterpartyName ?? null,
          counterpartyAccountNumber: counterpartyAccountNumber ?? null,
          counterpartyBankCode: counterpartyBankCode ?? null,
          variableSymbol: variableSymbol ?? null,
          constantSymbol: constantSymbol ?? null,
          specificSymbol: specificSymbol ?? null,
          bankReference: bankReference ?? null,
          source: source ?? 'MANUAL',
          note: note ?? null,
          noteInternal: noteInternal ?? null,
          version: 1,
          createdBy: createdBy ?? null,
        })
        .returning({ id: paymentGroups.id })

      await tx.insert(auditLog).values({
        entityType: 'payment_group',
        entityId: record.id,
        action: 'PAYMENT_GROUP_CREATED',
        diff: { direction, totalAmount, currency, transactionDate, source },
        userId: createdBy ?? null,
      })

      return record
    })

    return { success: true, data: { id: result.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── createFinancialMovement ────────────────────────────────────────
// Validations enforced here (not at DB level):
//   1. amount_gross = amount_net + vat_amount
//   2. vat_mode = NO_VAT → vat_amount must be 0
//   3. Tree linkage integrity
//   4. If payment_group_id is set: direction must match

export async function createFinancialMovement(
  input: CreateFinancialMovementInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createFinancialMovementSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const {
    paymentGroupId, orderId, orderItemId, subjectId, vatRegistrationId,
    centerId, direction, amountGross, amountNet, vatAmount, vatMode, vatRate,
    categoryId, typeId, detailId, description, movementDate, accountingDate,
    documentNumber, documentDate, note, noteInternal, createdBy,
  } = parsed.data

  // 1. VAT integrity: amount_gross = amount_net + vat_amount
  const scaledGross = Math.round(parseFloat(amountGross) * 100)
  const scaledNet   = Math.round(parseFloat(amountNet) * 100)
  const scaledVat   = Math.round(parseFloat(vatAmount ?? '0') * 100)
  if (scaledGross !== scaledNet + scaledVat) {
    return {
      success: false,
      error: `amount_gross (${amountGross}) must equal amount_net (${amountNet}) + vat_amount (${vatAmount ?? '0'}).`,
    }
  }

  // 2. NO_VAT mode → vat_amount must be 0
  if ((vatMode ?? 'NO_VAT') === 'NO_VAT' && scaledVat !== 0) {
    return {
      success: false,
      error: `vat_mode is NO_VAT but vat_amount is ${vatAmount}. vat_amount must be 0 when vat_mode is NO_VAT.`,
    }
  }

  // 3. Validate tree linkage integrity
  const detail = await db.query.financialTreeDetails.findFirst({
    where: eq(financialTreeDetails.id, detailId),
    columns: { id: true, typeId: true },
  })
  if (!detail) {
    return { success: false, error: `Financial tree detail not found: ${detailId}` }
  }
  if (detail.typeId !== typeId) {
    return { success: false, error: `Detail ${detailId} does not belong to type ${typeId}.` }
  }

  const type = await db.query.financialTreeTypes.findFirst({
    where: eq(financialTreeTypes.id, typeId),
    columns: { id: true, categoryId: true },
  })
  if (!type) {
    return { success: false, error: `Financial tree type not found: ${typeId}` }
  }
  if (type.categoryId !== categoryId) {
    return { success: false, error: `Type ${typeId} does not belong to category ${categoryId}.` }
  }

  // 4. If payment_group_id set: validate existence and direction match
  if (paymentGroupId) {
    const pg = await db.query.paymentGroups.findFirst({
      where: eq(paymentGroups.id, paymentGroupId),
      columns: { id: true, direction: true },
    })
    if (!pg) {
      return { success: false, error: `Payment group not found: ${paymentGroupId}` }
    }
    if (pg.direction !== direction) {
      return {
        success: false,
        error: `Movement direction (${direction}) must match payment group direction (${pg.direction}).`,
      }
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [record] = await tx
        .insert(financialMovements)
        .values({
          paymentGroupId: paymentGroupId ?? null,
          orderId: orderId ?? null,
          orderItemId: orderItemId ?? null,
          subjectId: subjectId ?? null,
          vatRegistrationId: vatRegistrationId ?? null,
          centerId,
          direction,
          amountGross,
          amountNet,
          vatAmount: vatAmount ?? '0',
          vatMode: vatMode ?? 'NO_VAT',
          vatRate: vatRate ?? '0',
          categoryId,
          typeId,
          detailId,
          description,
          movementDate,
          accountingDate: accountingDate ?? null,
          documentNumber: documentNumber ?? null,
          documentDate: documentDate ?? null,
          note: note ?? null,
          noteInternal: noteInternal ?? null,
          createdBy: createdBy ?? null,
        })
        .returning({ id: financialMovements.id })

      await tx.insert(auditLog).values({
        entityType: 'financial_movement',
        entityId: record.id,
        action: 'FINANCIAL_MOVEMENT_CREATED',
        diff: {
          direction, amountGross, amountNet, vatAmount: vatAmount ?? '0',
          vatMode: vatMode ?? 'NO_VAT', orderId: orderId ?? null,
          movementDate, description,
        },
        userId: createdBy ?? null,
      })

      return record
    })

    return { success: true, data: { id: result.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── createPaymentAllocation ────────────────────────────────────────
// Links an INCOME payment group to an order.
// Uses SELECT FOR UPDATE on payment_group to prevent concurrent over-allocation.

export async function createPaymentAllocation(
  input: CreatePaymentAllocationInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createPaymentAllocationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { paymentGroupId, orderId, allocatedAmount, note, createdBy } = parsed.data

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { id: true },
  })
  if (!order) {
    return { success: false, error: `Order not found: ${orderId}` }
  }

  const pgCheck = await db.query.paymentGroups.findFirst({
    where: eq(paymentGroups.id, paymentGroupId),
    columns: { id: true, direction: true, processingStatus: true },
  })
  if (!pgCheck) {
    return { success: false, error: `Payment group not found: ${paymentGroupId}` }
  }
  if (pgCheck.direction !== 'INCOME') {
    return {
      success: false,
      error:
        `Payment allocations can only be created against INCOME payment groups. ` +
        `Payment group ${paymentGroupId} has direction ${pgCheck.direction}.`,
    }
  }
  if (pgCheck.processingStatus === 'CANCELLED') {
    return { success: false, error: `Cannot allocate to a CANCELLED payment group: ${paymentGroupId}.` }
  }

  try {
    const result = await db.transaction(async (tx): Promise<{ error: string } | { id: string }> => {
      const [pg] = await tx
        .select({
          id: paymentGroups.id,
          totalAmount: paymentGroups.totalAmount,
          allocatedAmount: paymentGroups.allocatedAmount,
          direction: paymentGroups.direction,
          processingStatus: paymentGroups.processingStatus,
        })
        .from(paymentGroups)
        .where(eq(paymentGroups.id, paymentGroupId))
        .for('update')

      if (!pg) {
        return { error: `Payment group not found inside transaction: ${paymentGroupId}` }
      }

      if (pg.direction !== 'INCOME') {
        return {
          error:
            `Payment allocations can only be created against INCOME payment groups. ` +
            `Payment group ${paymentGroupId} has direction ${pg.direction}.`,
        }
      }
      if (pg.processingStatus === 'CANCELLED') {
        return { error: `Cannot allocate to a CANCELLED payment group: ${paymentGroupId}.` }
      }

      const currentAllocated = Math.round(parseFloat(pg.allocatedAmount) * 100)
      const newAllocation    = Math.round(parseFloat(allocatedAmount) * 100)
      const pgTotal          = Math.round(parseFloat(pg.totalAmount) * 100)

      if (currentAllocated + newAllocation > pgTotal) {
        const remaining = ((pgTotal - currentAllocated) / 100).toFixed(2)
        return {
          error:
            `Allocation of ${allocatedAmount} would exceed payment group total. ` +
            `Current allocated: ${pg.allocatedAmount}, group total: ${pg.totalAmount}. ` +
            `Remaining capacity: ${remaining}.`,
        }
      }

      const oldStatus = await recalculateOrderPaymentStatus(tx, orderId)

      const [record] = await tx
        .insert(paymentAllocations)
        .values({
          paymentGroupId,
          orderId,
          allocatedAmount,
          status: 'ACTIVE',
          note: note ?? null,
          createdBy: createdBy ?? null,
        })
        .returning({ id: paymentAllocations.id })

      await recalculatePaymentGroupAllocationState(tx, paymentGroupId)

      const newStatus = await recalculateOrderPaymentStatus(tx, orderId)

      if (oldStatus !== newStatus) {
        const orderTotal = await computeOrderTotal(tx, orderId)
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
        const allocatedTotal = allocationResult?.total ?? '0'

        await tx.insert(auditLog).values({
          entityType: 'order',
          entityId: orderId,
          action: 'ORDER_PAYMENT_STATUS_CHANGED',
          diff: { previousStatus: oldStatus, newStatus, allocatedAmount: allocatedTotal, orderTotal },
          userId: createdBy ?? null,
        })
      }

      await tx.insert(auditLog).values({
        entityType: 'payment_allocation',
        entityId: record.id,
        action: 'PAYMENT_ALLOCATION_CREATED',
        diff: { paymentGroupId, orderId, allocatedAmount },
        userId: createdBy ?? null,
      })

      return { id: record.id }
    })

    if ('error' in result) {
      return { success: false, error: result.error }
    }
    return { success: true, data: { id: result.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── cancelPaymentAllocation ────────────────────────────────────────
// Soft-cancels an ACTIVE allocation.

export async function cancelPaymentAllocation(
  input: CancelPaymentAllocationInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = cancelPaymentAllocationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { paymentAllocationId, cancelledBy, cancelledReason } = parsed.data

  try {
    const now = new Date()

    const result = await db.transaction(async (tx): Promise<{ error: string } | { id: string }> => {
      const current = await tx.query.paymentAllocations.findFirst({
        where: eq(paymentAllocations.id, paymentAllocationId),
        columns: {
          id: true,
          paymentGroupId: true,
          orderId: true,
          allocatedAmount: true,
          status: true,
        },
      })
      if (!current) {
        return { error: `Payment allocation not found: ${paymentAllocationId}` }
      }
      if (current.status === 'CANCELLED') {
        return { error: `Payment allocation ${paymentAllocationId} is already CANCELLED.` }
      }

      await tx
        .select({ id: paymentGroups.id })
        .from(paymentGroups)
        .where(eq(paymentGroups.id, current.paymentGroupId))
        .for('update')

      const oldStatus = await recalculateOrderPaymentStatus(tx, current.orderId)

      const [updated] = await tx
        .update(paymentAllocations)
        .set({ status: 'CANCELLED', cancelledAt: now, updatedAt: now })
        .where(
          and(
            eq(paymentAllocations.id, paymentAllocationId),
            eq(paymentAllocations.status, 'ACTIVE'),
          ),
        )
        .returning({ id: paymentAllocations.id })

      if (!updated) {
        return {
          error:
            `Cannot cancel: allocation ${paymentAllocationId} is not ACTIVE. ` +
            `It may have been cancelled concurrently.`,
        }
      }

      await recalculatePaymentGroupAllocationState(tx, current.paymentGroupId)

      const newStatus = await recalculateOrderPaymentStatus(tx, current.orderId)

      if (oldStatus !== newStatus) {
        const orderTotal = await computeOrderTotal(tx, current.orderId)
        const [allocationResult] = await tx
          .select({
            total: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmount})::text, '0')`,
          })
          .from(paymentAllocations)
          .where(
            and(
              eq(paymentAllocations.orderId, current.orderId),
              eq(paymentAllocations.status, 'ACTIVE'),
            ),
          )
        const allocatedTotal = allocationResult?.total ?? '0'

        await tx.insert(auditLog).values({
          entityType: 'order',
          entityId: current.orderId,
          action: 'ORDER_PAYMENT_STATUS_CHANGED',
          diff: { previousStatus: oldStatus, newStatus, allocatedAmount: allocatedTotal, orderTotal },
          userId: cancelledBy ?? null,
        })
      }

      await tx.insert(auditLog).values({
        entityType: 'payment_allocation',
        entityId: paymentAllocationId,
        action: 'PAYMENT_ALLOCATION_CANCELLED',
        diff: {
          paymentGroupId: current.paymentGroupId,
          orderId: current.orderId,
          allocatedAmount: current.allocatedAmount,
          cancelledAt: now.toISOString(),
          ...(cancelledReason ? { cancelledReason } : {}),
        },
        userId: cancelledBy ?? null,
      })

      return { id: paymentAllocationId }
    })

    if ('error' in result) {
      return { success: false, error: result.error }
    }
    return { success: true, data: { id: result.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── listPaymentGroups ──────────────────────────────────────────────

export type PaymentGroupListItem = {
  id: string
  centerId: string
  direction: string
  totalAmount: string
  allocatedAmount: string
  processingStatus: string
  currency: string
  transactionDate: string
  counterpartyName: string | null
  counterpartyAccountNumber: string | null
  variableSymbol: string | null
  source: string
  note: string | null
  createdAt: Date
  updatedAt: Date
}

export async function listPaymentGroups(
  input: ListPaymentGroupsInput = {},
): Promise<ActionResult<{ items: PaymentGroupListItem[]; total: number }>> {
  const parsed = listPaymentGroupsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { direction, processingStatus, limit, offset } = parsed.data

  const where =
    direction && processingStatus
      ? and(eq(paymentGroups.direction, direction), eq(paymentGroups.processingStatus, processingStatus))
      : direction
        ? eq(paymentGroups.direction, direction)
        : processingStatus
          ? eq(paymentGroups.processingStatus, processingStatus)
          : undefined

  try {
    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: paymentGroups.id,
          centerId: paymentGroups.centerId,
          direction: paymentGroups.direction,
          totalAmount: paymentGroups.totalAmount,
          allocatedAmount: paymentGroups.allocatedAmount,
          processingStatus: paymentGroups.processingStatus,
          currency: paymentGroups.currency,
          transactionDate: paymentGroups.transactionDate,
          counterpartyName: paymentGroups.counterpartyName,
          counterpartyAccountNumber: paymentGroups.counterpartyAccountNumber,
          variableSymbol: paymentGroups.variableSymbol,
          source: paymentGroups.source,
          note: paymentGroups.note,
          createdAt: paymentGroups.createdAt,
          updatedAt: paymentGroups.updatedAt,
        })
        .from(paymentGroups)
        .where(where)
        .orderBy(paymentGroups.createdAt)
        .limit(limit)
        .offset(offset),

      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(paymentGroups)
        .where(where),
    ])

    return { success: true, data: { items: rows as PaymentGroupListItem[], total: countRows[0].count } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── listFinancialMovements ─────────────────────────────────────────

export type FinancialMovementListItem = {
  id: string
  paymentGroupId: string | null
  orderId: string | null
  centerId: string
  direction: string
  amountGross: string
  amountNet: string
  vatAmount: string
  vatMode: string
  description: string
  movementDate: string
  createdAt: Date
}

export async function listFinancialMovements(
  input: ListFinancialMovementsInput = {},
): Promise<ActionResult<{ items: FinancialMovementListItem[]; total: number }>> {
  const parsed = listFinancialMovementsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { orderId, direction, movementDateFrom, movementDateTo, limit, offset } = parsed.data

  const conditions = []
  if (orderId)          conditions.push(eq(financialMovements.orderId, orderId))
  if (direction)        conditions.push(eq(financialMovements.direction, direction))
  if (movementDateFrom) conditions.push(gte(financialMovements.movementDate, movementDateFrom))
  if (movementDateTo)   conditions.push(lte(financialMovements.movementDate, movementDateTo))

  const where = conditions.length > 1
    ? and(...(conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))
    : conditions[0]

  try {
    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: financialMovements.id,
          paymentGroupId: financialMovements.paymentGroupId,
          orderId: financialMovements.orderId,
          centerId: financialMovements.centerId,
          direction: financialMovements.direction,
          amountGross: financialMovements.amountGross,
          amountNet: financialMovements.amountNet,
          vatAmount: financialMovements.vatAmount,
          vatMode: financialMovements.vatMode,
          description: financialMovements.description,
          movementDate: financialMovements.movementDate,
          createdAt: financialMovements.createdAt,
        })
        .from(financialMovements)
        .where(where)
        .orderBy(financialMovements.movementDate)
        .limit(limit)
        .offset(offset),

      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(financialMovements)
        .where(where),
    ])

    return { success: true, data: { items: rows as FinancialMovementListItem[], total: countRows[0].count } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── listAllocationsForOrder ────────────────────────────────────────

export type PaymentAllocationItem = {
  id: string
  paymentGroupId: string
  orderId: string
  allocatedAmount: string
  status: string
  cancelledAt: Date | null
  note: string | null
  createdAt: Date
}

export async function listAllocationsForOrder(
  orderId: string,
): Promise<ActionResult<{ items: PaymentAllocationItem[] }>> {
  if (!orderId || typeof orderId !== 'string') {
    return { success: false, error: 'orderId is required.' }
  }

  try {
    const rows = await db
      .select({
        id: paymentAllocations.id,
        paymentGroupId: paymentAllocations.paymentGroupId,
        orderId: paymentAllocations.orderId,
        allocatedAmount: paymentAllocations.allocatedAmount,
        status: paymentAllocations.status,
        cancelledAt: paymentAllocations.cancelledAt,
        note: paymentAllocations.note,
        createdAt: paymentAllocations.createdAt,
      })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.orderId, orderId))
      .orderBy(paymentAllocations.createdAt)

    return { success: true, data: { items: rows as PaymentAllocationItem[] } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── getOrderPaymentStatus ──────────────────────────────────────────

export async function getOrderPaymentStatus(
  orderId: string,
): Promise<ActionResult<{ status: PaymentStatus; allocatedAmount: string; orderTotal: string }>> {
  if (!orderId || typeof orderId !== 'string') {
    return { success: false, error: 'orderId is required.' }
  }

  try {
    const [allocationResult] = await db
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

    const allocatedAmount = allocationResult?.total ?? '0'

    const [itemsResult] = await db
      .select({
        total: sql<string>`coalesce(sum(${orderItems.totalPrice})::text, '0')`,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))

    const orderTotal = itemsResult?.total ?? '0'
    const status = computeOrderPaymentStatus(allocatedAmount, orderTotal)

    return { success: true, data: { status, allocatedAmount, orderTotal } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── getOrderEconomics ──────────────────────────────────────────────

export type OrderEconomics = {
  allocatedPayments: string
  expenseTotal: string
  actualProfit: string
  paymentStatus: PaymentStatus
  orderTotal: string
}

export async function getOrderEconomics(
  orderId: string,
): Promise<ActionResult<OrderEconomics>> {
  if (!orderId || typeof orderId !== 'string') {
    return { success: false, error: 'orderId is required.' }
  }

  try {
    const [allocationResult, expenseResult, itemsResult] = await Promise.all([
      db
        .select({ total: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmount})::text, '0')` })
        .from(paymentAllocations)
        .where(and(eq(paymentAllocations.orderId, orderId), eq(paymentAllocations.status, 'ACTIVE'))),

      db
        .select({ total: sql<string>`coalesce(sum(${financialMovements.amountGross})::text, '0')` })
        .from(financialMovements)
        .where(and(eq(financialMovements.orderId, orderId), eq(financialMovements.direction, 'EXPENSE'))),

      db
        .select({ total: sql<string>`coalesce(sum(${orderItems.totalPrice})::text, '0')` })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId)),
    ])

    const allocatedPayments = allocationResult[0]?.total ?? '0'
    const expenseTotal      = expenseResult[0]?.total ?? '0'
    const orderTotal        = itemsResult[0]?.total ?? '0'

    const profitScaled =
      Math.round(parseFloat(allocatedPayments) * 100) -
      Math.round(parseFloat(expenseTotal) * 100)
    const actualProfit = (profitScaled / 100).toFixed(2)

    const paymentStatus = computeOrderPaymentStatus(allocatedPayments, orderTotal)

    return { success: true, data: { allocatedPayments, expenseTotal, actualProfit, paymentStatus, orderTotal } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
