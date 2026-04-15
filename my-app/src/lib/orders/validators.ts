import { z } from 'zod'
import { ORDER_TYPES, ORDER_STATUSES } from '@/db/schema'

// ── createOrder ────────────────────────────────────────────────────

export const createOrderSchema = z.object({
  orderType: z.enum(ORDER_TYPES),
  // Denormalized cache — optional. Authoritative client comes from a participant row.
  clientSubjectId: z.string().uuid().optional(),
  // For SHELF_PURCHASE orders: the company-for-sale record this order is executing.
  // Setting this field does NOT reserve the company — call reserveCompanyForSale() explicitly.
  companyForSaleId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.string().optional(), // ISO date: YYYY-MM-DD
  notes: z.string().optional(),
  // Required when client has risk_level = HIGH. Must be explicitly set to true.
  // Its presence is logged. Omitting it blocks order creation for HIGH risk subjects.
  amlOverride: z.boolean().optional(),
})

export type CreateOrderInput = z.input<typeof createOrderSchema>

// ── updateOrderStatus ──────────────────────────────────────────────

export const updateOrderStatusSchema = z.object({
  orderId: z.string().uuid(),
  newStatus: z.enum(ORDER_STATUSES),
})

export type UpdateOrderStatusInput = z.input<typeof updateOrderStatusSchema>

// ── addOrderParticipant ────────────────────────────────────────────

export const addOrderParticipantSchema = z
  .object({
    orderId: z.string().uuid(),
    subjectId: z.string().uuid().optional(),
    futureSubjectId: z.string().uuid().optional(),
    roleCode: z.string().min(1, 'Role code is required'),
    sharePercentage: z.number().min(0).max(100).optional(),
    participantContextType: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      const hasSubject = data.subjectId != null
      const hasFuture = data.futureSubjectId != null
      // XOR — exactly one must be set
      return hasSubject !== hasFuture
    },
    { message: 'Exactly one of subjectId or futureSubjectId must be provided' },
  )

export type AddOrderParticipantInput = z.input<typeof addOrderParticipantSchema>

// ── listOrders ─────────────────────────────────────────────────────

export const listOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  orderType: z.enum(ORDER_TYPES).optional(),
  clientSubjectId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  search: z.string().optional(), // matches against order number
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
})

export type ListOrdersQueryInput = z.input<typeof listOrdersQuerySchema>
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>
