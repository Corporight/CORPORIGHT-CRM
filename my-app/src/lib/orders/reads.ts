import { db } from '@/db'
import { orders } from '@/db/schema'
import { eq } from 'drizzle-orm'

export type OrderDetail = {
  id: string
  number: string
  orderType: string
  status: string
  clientSubjectId: string | null
  assignedTo: string | null
  dueDate: string | null
  notes: string | null
  confirmedAt: Date | null
  completedAt: Date | null
  cancelledAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const row = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: {
      id: true,
      number: true,
      orderType: true,
      status: true,
      clientSubjectId: true,
      assignedTo: true,
      dueDate: true,
      notes: true,
      confirmedAt: true,
      completedAt: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return row ?? null
}
