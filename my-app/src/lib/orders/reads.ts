import { db } from '@/db'
import { orders, orderParticipants, orderItems, subjects, paymentAllocations } from '@/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { computeOrderPaymentStatus, type PaymentStatus } from '@/lib/finance/helpers'

export type OrderParticipantRow = {
  id: string
  roleCode: string
  subjectId: string | null
  futureSubjectId: string | null
  displayName: string | null
  sharePercentage: string | null
  participantContextType: string | null
  notes: string | null
}

export type OrderItemRow = {
  id: string
  itemType: string
  description: string
  quantity: string
  unitPrice: string
  totalPrice: string
  notes: string | null
}

export type OrderDetail = {
  id: string
  number: string
  orderType: string
  status: string
  clientSubjectId: string | null
  clientDisplayName: string | null
  assignedTo: string | null
  dueDate: string | null
  notes: string | null
  confirmedAt: Date | null
  completedAt: Date | null
  cancelledAt: Date | null
  createdAt: Date
  updatedAt: Date
  participants: OrderParticipantRow[]
  items: OrderItemRow[]
  paymentStatus: PaymentStatus
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const rows = await db
    .select({
      id: orders.id,
      number: orders.number,
      orderType: orders.orderType,
      status: orders.status,
      clientSubjectId: orders.clientSubjectId,
      clientDisplayName: subjects.displayName,
      assignedTo: orders.assignedTo,
      dueDate: orders.dueDate,
      notes: orders.notes,
      confirmedAt: orders.confirmedAt,
      completedAt: orders.completedAt,
      cancelledAt: orders.cancelledAt,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .leftJoin(subjects, eq(orders.clientSubjectId, subjects.id))
    .where(eq(orders.id, orderId))
    .limit(1)

  if (!rows[0]) return null

  const [participantRows, itemRows, allocationRows] = await Promise.all([
    db
      .select({
        id: orderParticipants.id,
        roleCode: orderParticipants.roleCode,
        subjectId: orderParticipants.subjectId,
        futureSubjectId: orderParticipants.futureSubjectId,
        displayName: subjects.displayName,
        sharePercentage: orderParticipants.sharePercentage,
        participantContextType: orderParticipants.participantContextType,
        notes: orderParticipants.notes,
      })
      .from(orderParticipants)
      .leftJoin(subjects, eq(orderParticipants.subjectId, subjects.id))
      .where(eq(orderParticipants.orderId, orderId))
      .orderBy(orderParticipants.createdAt),

    db
      .select({
        id: orderItems.id,
        itemType: orderItems.itemType,
        description: orderItems.description,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
        notes: orderItems.notes,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(orderItems.createdAt),

    db
      .select({
        total: sql<string>`coalesce(sum(${paymentAllocations.allocatedAmount})::text, '0')`,
      })
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.orderId, orderId),
          eq(paymentAllocations.status, 'ACTIVE'),
        ),
      ),
  ])

  const orderTotalCents = itemRows.reduce(
    (sum, item) => sum + Math.round(parseFloat(item.totalPrice) * 100),
    0,
  )
  const orderTotal = (orderTotalCents / 100).toFixed(2)
  const paymentStatus = computeOrderPaymentStatus(allocationRows[0].total, orderTotal)

  return {
    ...rows[0],
    participants: participantRows,
    items: itemRows,
    paymentStatus,
  }
}
