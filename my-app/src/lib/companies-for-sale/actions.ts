'use server'

// CompaniesForSale service — createCompanyForSale, reserveCompanyForSale,
// releaseCompanyForSaleReservation, markCompanyForSaleSold,
// withdrawCompanyForSale, listCompaniesForSale, getCompanyForSale.
//
// State machine (enforced at application layer):
//   FOR_SALE  → RESERVED   (reserveCompanyForSale)
//   FOR_SALE  → WITHDRAWN  (withdrawCompanyForSale)
//   RESERVED  → FOR_SALE   (releaseCompanyForSaleReservation)
//   RESERVED  → SOLD       (markCompanyForSaleSold)
//   RESERVED  → WITHDRAWN  (withdrawCompanyForSale)
//   SOLD      → (terminal — no further transitions permitted)
//   WITHDRAWN → (terminal — no further transitions permitted)
//
// Guards:
//   - A subject that already has an active listing cannot be listed again
//     (enforced by partial unique index; surfaced early with a clear error).
//   - Reservation requires status = FOR_SALE and a SHELF_PURCHASE order.
//   - Sale requires status = RESERVED (must be explicitly reserved first).
//   - Withdrawal is permitted from FOR_SALE or RESERVED.
//
// Prices:
//   Drizzle returns numeric columns as strings. All price values in return
//   types are string (matching PostgreSQL numeric → JS string mapping).
//   Callers are responsible for parsing before arithmetic.

import { db } from '@/db'
import {
  companiesForSale,
  orders,
  subjects,
  auditLog,
} from '@/db/schema'
import { eq, and, inArray, sql } from 'drizzle-orm'
import {
  createCompanyForSaleSchema,
  reserveCompanyForSaleSchema,
  releaseCompanyForSaleReservationSchema,
  markCompanyForSaleSoldSchema,
  withdrawCompanyForSaleSchema,
  listCompaniesForSaleSchema,
  type CreateCompanyForSaleInput,
  type ReserveCompanyForSaleInput,
  type ReleaseCompanyForSaleReservationInput,
  type MarkCompanyForSaleSoldInput,
  type WithdrawCompanyForSaleInput,
  type ListCompaniesForSaleInput,
} from './validators'

// ── Result type ────────────────────────────────────────────────────

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// ── createCompanyForSale ───────────────────────────────────────────
// Lists a company subject as available for purchase.
// The subject must exist, be active, and be a COMPANY.
// Fails if a non-terminal listing for this subject already exists.

export async function createCompanyForSale(
  input: CreateCompanyForSaleInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createCompanyForSaleSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { subjectId, sourceType, basePrice, note, createdBy } = parsed.data
  const currentPrice = parsed.data.currentPrice ?? basePrice

  // Validate subject: must exist, be active, be a COMPANY.
  const subject = await db.query.subjects.findFirst({
    where: eq(subjects.id, subjectId),
    columns: { id: true, type: true, isActive: true },
  })
  if (!subject) {
    return { success: false, error: `Subject not found: ${subjectId}` }
  }
  if (!subject.isActive) {
    return { success: false, error: `Subject is inactive: ${subjectId}` }
  }
  if (subject.type !== 'COMPANY') {
    return {
      success: false,
      error: `Only COMPANY subjects can be listed for sale. Subject ${subjectId} is type: ${subject.type}`,
    }
  }

  // Surface the unique-constraint violation early with a clear message.
  const existing = await db.query.companiesForSale.findFirst({
    where: and(
      eq(companiesForSale.subjectId, subjectId),
      // Match what the partial unique index enforces: status NOT IN ('SOLD', 'WITHDRAWN')
    ),
    columns: { id: true, status: true },
  })
  // findFirst without a status filter returns any row — we check in JS.
  // If the result is SOLD or WITHDRAWN it's historical and a new listing is allowed.
  if (existing && existing.status !== 'SOLD' && existing.status !== 'WITHDRAWN') {
    return {
      success: false,
      error:
        `Subject ${subjectId} already has an active company-for-sale listing ` +
        `(id: ${existing.id}, status: ${existing.status}). ` +
        `Withdraw or mark it sold before creating a new listing.`,
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [record] = await tx
        .insert(companiesForSale)
        .values({
          subjectId,
          status: 'FOR_SALE',
          sourceType,
          basePrice,
          currentPrice,
          note: note ?? null,
          createdBy: createdBy ?? null,
        })
        .returning({ id: companiesForSale.id })

      await tx.insert(auditLog).values({
        entityType: 'company_for_sale',
        entityId: record.id,
        action: 'COMPANY_FOR_SALE_CREATED',
        diff: { subjectId, sourceType, basePrice, currentPrice },
        userId: createdBy ?? null,
      })

      return record
    })

    return { success: true, data: { id: result.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // Translate the DB unique constraint violation into a readable message.
    if (message.includes('uq_companies_for_sale_subject_active')) {
      return {
        success: false,
        error: `Subject ${subjectId} already has an active company-for-sale listing.`,
      }
    }
    return { success: false, error: message }
  }
}

// ── reserveCompanyForSale ──────────────────────────────────────────
// Marks a listing as RESERVED and links it to the given order.
// The order must exist and be a SHELF_PURCHASE.
// Only listings with status = FOR_SALE can be reserved.
// The UPDATE includes status = 'FOR_SALE' in its WHERE clause so that a
// concurrent reservation that committed between validation and write is
// detected via a 0-row return rather than a silent overwrite.

export async function reserveCompanyForSale(
  input: ReserveCompanyForSaleInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = reserveCompanyForSaleSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { companyForSaleId, orderId, reservedBy } = parsed.data

  // Verify the order exists and is a SHELF_PURCHASE.
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { id: true, orderType: true, status: true },
  })
  if (!order) {
    return { success: false, error: `Order not found: ${orderId}` }
  }
  if (order.orderType !== 'SHELF_PURCHASE') {
    return {
      success: false,
      error:
        `Only SHELF_PURCHASE orders can reserve a company for sale. ` +
        `Order ${orderId} is type: ${order.orderType}`,
    }
  }
  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
    return {
      success: false,
      error: `Cannot reserve for a ${order.status} order.`,
    }
  }

  try {
    const now = new Date()

    const result = await db.transaction(async (tx): Promise<{ error: string } | { id: string }> => {
      const [updated] = await tx
        .update(companiesForSale)
        .set({
          status: 'RESERVED',
          reservedByOrderId: orderId,
          reservedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(companiesForSale.id, companyForSaleId),
            eq(companiesForSale.status, 'FOR_SALE'),
          ),
        )
        .returning({ id: companiesForSale.id })

      if (!updated) {
        return {
          error:
            `Cannot reserve: listing ${companyForSaleId} was not found or is not FOR_SALE. ` +
            `The listing may have been reserved or removed concurrently.`,
        }
      }

      await tx.insert(auditLog).values({
        entityType: 'company_for_sale',
        entityId: companyForSaleId,
        action: 'COMPANY_FOR_SALE_RESERVED',
        diff: { orderId, reservedAt: now.toISOString() },
        userId: reservedBy ?? null,
      })

      return { id: companyForSaleId }
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

// ── releaseCompanyForSaleReservation ───────────────────────────────
// Returns a RESERVED listing to FOR_SALE and clears the order link.
// Use when an order is cancelled or the reservation should be undone.
// The UPDATE includes status = 'RESERVED' in its WHERE clause; a 0-row
// return means the listing was modified concurrently and the release is rejected.

export async function releaseCompanyForSaleReservation(
  input: ReleaseCompanyForSaleReservationInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = releaseCompanyForSaleReservationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { companyForSaleId, releasedBy } = parsed.data

  try {
    const now = new Date()

    const result = await db.transaction(async (tx): Promise<{ error: string } | { id: string }> => {
      // Read reservedByOrderId inside the tx — needed for the audit log diff.
      // The status guard is enforced by the WHERE clause below, not here.
      const current = await tx.query.companiesForSale.findFirst({
        where: eq(companiesForSale.id, companyForSaleId),
        columns: { id: true, reservedByOrderId: true },
      })
      if (!current) {
        return { error: `Company-for-sale record not found: ${companyForSaleId}` }
      }

      const [updated] = await tx
        .update(companiesForSale)
        .set({
          status: 'FOR_SALE',
          reservedByOrderId: null,
          reservedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(companiesForSale.id, companyForSaleId),
            eq(companiesForSale.status, 'RESERVED'),
          ),
        )
        .returning({ id: companiesForSale.id })

      if (!updated) {
        return {
          error:
            `Cannot release reservation: listing ${companyForSaleId} is not RESERVED. ` +
            `Only RESERVED listings can be released.`,
        }
      }

      await tx.insert(auditLog).values({
        entityType: 'company_for_sale',
        entityId: companyForSaleId,
        action: 'COMPANY_FOR_SALE_RESERVATION_RELEASED',
        diff: { previousOrderId: current.reservedByOrderId, releasedAt: now.toISOString() },
        userId: releasedBy ?? null,
      })

      return { id: companyForSaleId }
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

// ── markCompanyForSaleSold ─────────────────────────────────────────
// Marks a listing as SOLD (terminal state).
// Requires status = RESERVED — sale must be preceded by an explicit reservation.
// Sets soldAt to now.
// The UPDATE includes status = 'RESERVED' in its WHERE clause so that a
// concurrent modification committed between read and write is detected via
// a 0-row return rather than a silent overwrite.

export async function markCompanyForSaleSold(
  input: MarkCompanyForSaleSoldInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = markCompanyForSaleSoldSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { companyForSaleId, soldBy } = parsed.data

  try {
    const now = new Date()

    const result = await db.transaction(async (tx): Promise<{ error: string } | { id: string }> => {
      // Read reservedByOrderId inside the tx — needed for the audit log diff.
      // The status guard is enforced by the WHERE clause below, not here.
      const current = await tx.query.companiesForSale.findFirst({
        where: eq(companiesForSale.id, companyForSaleId),
        columns: { id: true, reservedByOrderId: true },
      })
      if (!current) {
        return { error: `Company-for-sale record not found: ${companyForSaleId}` }
      }

      const [updated] = await tx
        .update(companiesForSale)
        .set({
          status: 'SOLD',
          soldAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(companiesForSale.id, companyForSaleId),
            eq(companiesForSale.status, 'RESERVED'),
          ),
        )
        .returning({ id: companiesForSale.id })

      if (!updated) {
        return {
          error:
            `Cannot mark sold: listing ${companyForSaleId} is not RESERVED. ` +
            `A listing must be RESERVED before it can be marked SOLD. ` +
            `The listing may have been modified concurrently.`,
        }
      }

      await tx.insert(auditLog).values({
        entityType: 'company_for_sale',
        entityId: companyForSaleId,
        action: 'COMPANY_FOR_SALE_SOLD',
        diff: {
          soldAt: now.toISOString(),
          reservedByOrderId: current.reservedByOrderId,
        },
        userId: soldBy ?? null,
      })

      return { id: companyForSaleId }
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

// ── withdrawCompanyForSale ─────────────────────────────────────────
// Removes a listing from the market (terminal state).
// Permitted from FOR_SALE or RESERVED.
// If RESERVED, clears the reservation fields before withdrawing.
// The UPDATE includes status IN ('FOR_SALE','RESERVED') in its WHERE clause
// so that a concurrent modification is detected via a 0-row return rather
// than a silent overwrite.

export async function withdrawCompanyForSale(
  input: WithdrawCompanyForSaleInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = withdrawCompanyForSaleSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { companyForSaleId, withdrawnBy, note } = parsed.data

  try {
    const now = new Date()

    const result = await db.transaction(async (tx): Promise<{ error: string } | { id: string }> => {
      // Read status and reservedByOrderId inside the tx — needed for the audit log diff.
      // The status guard is enforced by the WHERE clause below, not here.
      const current = await tx.query.companiesForSale.findFirst({
        where: eq(companiesForSale.id, companyForSaleId),
        columns: { id: true, status: true, reservedByOrderId: true },
      })
      if (!current) {
        return { error: `Company-for-sale record not found: ${companyForSaleId}` }
      }

      const [updated] = await tx
        .update(companiesForSale)
        .set({
          status: 'WITHDRAWN',
          // Clear reservation fields if withdrawing from RESERVED.
          reservedByOrderId: null,
          reservedAt: null,
          // Persist withdrawal note if provided.
          ...(note != null ? { note } : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(companiesForSale.id, companyForSaleId),
            inArray(companiesForSale.status, ['FOR_SALE', 'RESERVED']),
          ),
        )
        .returning({ id: companiesForSale.id })

      if (!updated) {
        return {
          error:
            `Cannot withdraw: listing ${companyForSaleId} is not FOR_SALE or RESERVED. ` +
            `Only FOR_SALE or RESERVED listings can be withdrawn. ` +
            `The listing may have been modified concurrently.`,
        }
      }

      await tx.insert(auditLog).values({
        entityType: 'company_for_sale',
        entityId: companyForSaleId,
        action: 'COMPANY_FOR_SALE_WITHDRAWN',
        diff: {
          previousStatus: current.status,
          previousOrderId: current.reservedByOrderId ?? null,
          withdrawnAt: now.toISOString(),
          note: note ?? null,
        },
        userId: withdrawnBy ?? null,
      })

      return { id: companyForSaleId }
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

// ── listCompaniesForSale ───────────────────────────────────────────
// Returns paginated listings. Defaults to all statuses.
// Joins with subjects to include the company display name.

export type CompanyForSaleListItem = {
  id: string
  subjectId: string
  subjectDisplayName: string | null
  status: string
  sourceType: string
  basePrice: string
  currentPrice: string
  reservedByOrderId: string | null
  reservedAt: Date | null
  soldAt: Date | null
  note: string | null
  createdAt: Date
  updatedAt: Date
}

export async function listCompaniesForSale(
  input: ListCompaniesForSaleInput = {},
): Promise<ActionResult<{ items: CompanyForSaleListItem[]; total: number }>> {
  const parsed = listCompaniesForSaleSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { status, sourceType, limit, offset } = parsed.data

  const where =
    status && sourceType ? and(eq(companiesForSale.status, status), eq(companiesForSale.sourceType, sourceType))
    : status             ? eq(companiesForSale.status, status)
    : sourceType         ? eq(companiesForSale.sourceType, sourceType)
    : undefined

  try {
    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: companiesForSale.id,
          subjectId: companiesForSale.subjectId,
          subjectDisplayName: subjects.displayName,
          status: companiesForSale.status,
          sourceType: companiesForSale.sourceType,
          basePrice: companiesForSale.basePrice,
          currentPrice: companiesForSale.currentPrice,
          reservedByOrderId: companiesForSale.reservedByOrderId,
          reservedAt: companiesForSale.reservedAt,
          soldAt: companiesForSale.soldAt,
          note: companiesForSale.note,
          createdAt: companiesForSale.createdAt,
          updatedAt: companiesForSale.updatedAt,
        })
        .from(companiesForSale)
        .leftJoin(subjects, eq(companiesForSale.subjectId, subjects.id))
        .where(where)
        .orderBy(companiesForSale.createdAt)
        .limit(limit)
        .offset(offset),

      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(companiesForSale)
        .where(where),
    ])

    return {
      success: true,
      data: {
        items: rows as CompanyForSaleListItem[],
        total: countRows[0].count,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── getCompanyForSale ──────────────────────────────────────────────
// Fetches a single listing by ID. Includes subject display name.

export type CompanyForSaleDetail = CompanyForSaleListItem

export async function getCompanyForSale(
  id: string,
): Promise<ActionResult<CompanyForSaleDetail>> {
  if (!id || typeof id !== 'string') {
    return { success: false, error: 'id is required.' }
  }

  try {
    const rows = await db
      .select({
        id: companiesForSale.id,
        subjectId: companiesForSale.subjectId,
        subjectDisplayName: subjects.displayName,
        status: companiesForSale.status,
        sourceType: companiesForSale.sourceType,
        basePrice: companiesForSale.basePrice,
        currentPrice: companiesForSale.currentPrice,
        reservedByOrderId: companiesForSale.reservedByOrderId,
        reservedAt: companiesForSale.reservedAt,
        soldAt: companiesForSale.soldAt,
        note: companiesForSale.note,
        createdAt: companiesForSale.createdAt,
        updatedAt: companiesForSale.updatedAt,
      })
      .from(companiesForSale)
      .leftJoin(subjects, eq(companiesForSale.subjectId, subjects.id))
      .where(eq(companiesForSale.id, id))

    if (rows.length === 0) {
      return { success: false, error: `Company-for-sale record not found: ${id}` }
    }

    return { success: true, data: rows[0] as CompanyForSaleDetail }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
