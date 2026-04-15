'use server'

// Subject server actions — create, get, list.
//
// Invariants enforced here (CLAUDE.md):
//   - subjects.type is set once at INSERT and never updated
//   - COMPANY profile is created in the same transaction as the subject row
//   - PERSON profile is created in the same transaction as the subject row
//   - is_primary uniqueness per (subject_id, address_type) is enforced by DB index

import { db } from '@/db'
import {
  subjects,
  subjectPersonProfiles,
  subjectCompanyProfiles,
  subjectAddresses,
  subjectRoles,
} from '@/db/schema'
import { eq, ilike, and, inArray } from 'drizzle-orm'
import {
  createPersonSubjectSchema,
  createCompanySubjectSchema,
  listSubjectsQuerySchema,
  type CreatePersonSubjectInput,
  type CreateCompanySubjectInput,
  type ListSubjectsQueryInput,
} from './validators'

// ── Result type ────────────────────────────────────────────────────

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// ── createPersonSubject ────────────────────────────────────────────

export async function createPersonSubject(
  input: CreatePersonSubjectInput,
): Promise<ActionResult<{ id: string; displayName: string }>> {
  const parsed = createPersonSubjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { profile, address, role, ...core } = parsed.data
  const displayName = `${profile.firstName} ${profile.lastName}`

  try {
    const result = await db.transaction(async (tx) => {
      const [subject] = await tx
        .insert(subjects)
        .values({ type: 'PERSON', displayName, ...core })
        .returning({ id: subjects.id, displayName: subjects.displayName })

      await tx.insert(subjectPersonProfiles).values({
        subjectId: subject.id,
        firstName: profile.firstName,
        lastName: profile.lastName,
        birthDate: profile.birthDate ?? null,
        birthNumber: profile.birthNumber ?? null,
        nationality: profile.nationality ?? null,
        idDocType: profile.idDocType ?? null,
        idDocNumber: profile.idDocNumber ?? null,
        idDocExpiry: profile.idDocExpiry ?? null,
      })

      if (address) {
        await tx.insert(subjectAddresses).values({
          subjectId: subject.id,
          ...address,
          isPrimary: true,
        })
      }

      if (role) {
        await tx.insert(subjectRoles).values({
          subjectId: subject.id,
          role,
        })
      }

      return subject
    })

    return { success: true, data: result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // Surface duplicate-key errors clearly
    if (message.includes('unique')) {
      return { success: false, error: 'A subject with this data already exists.' }
    }
    return { success: false, error: message }
  }
}

// ── createCompanySubject ───────────────────────────────────────────

export async function createCompanySubject(
  input: CreateCompanySubjectInput,
): Promise<ActionResult<{ id: string; displayName: string }>> {
  const parsed = createCompanySubjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { profile, address, role, ...core } = parsed.data
  const displayName = profile.companyName

  try {
    const result = await db.transaction(async (tx) => {
      const [subject] = await tx
        .insert(subjects)
        .values({ type: 'COMPANY', displayName, ...core })
        .returning({ id: subjects.id, displayName: subjects.displayName })

      await tx.insert(subjectCompanyProfiles).values({
        subjectId: subject.id,
        companyName: profile.companyName,
        registrationNumber: profile.registrationNumber,
        vatNumber: profile.vatNumber ?? null,
        legalForm: profile.legalForm ?? null,
        registrationDate: profile.registrationDate ?? null,
        registrationCourt: profile.registrationCourt ?? null,
      })

      if (address) {
        await tx.insert(subjectAddresses).values({
          subjectId: subject.id,
          ...address,
          isPrimary: true,
        })
      }

      if (role) {
        await tx.insert(subjectRoles).values({
          subjectId: subject.id,
          role,
        })
      }

      return subject
    })

    return { success: true, data: result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('unique') && message.includes('registration_number')) {
      return {
        success: false,
        error: `A company with registration number ${input.profile?.registrationNumber} already exists.`,
      }
    }
    if (message.includes('unique')) {
      return { success: false, error: 'A subject with this data already exists.' }
    }
    return { success: false, error: message }
  }
}

// ── getSubjectDetail ───────────────────────────────────────────────

export type SubjectDetail =
  | {
      type: 'PERSON'
      subject: typeof subjects.$inferSelect
      profile: typeof subjectPersonProfiles.$inferSelect
      addresses: (typeof subjectAddresses.$inferSelect)[]
      roles: (typeof subjectRoles.$inferSelect)[]
    }
  | {
      type: 'COMPANY'
      subject: typeof subjects.$inferSelect
      profile: typeof subjectCompanyProfiles.$inferSelect
      addresses: (typeof subjectAddresses.$inferSelect)[]
      roles: (typeof subjectRoles.$inferSelect)[]
    }

export async function getSubjectDetail(
  id: string,
): Promise<ActionResult<SubjectDetail>> {
  try {
    const subject = await db.query.subjects.findFirst({
      where: eq(subjects.id, id),
    })

    if (!subject) {
      return { success: false, error: 'Subject not found.' }
    }

    const [addresses, roles] = await Promise.all([
      db.select().from(subjectAddresses).where(eq(subjectAddresses.subjectId, id)),
      db.select().from(subjectRoles).where(eq(subjectRoles.subjectId, id)),
    ])

    if (subject.type === 'PERSON') {
      const profile = await db.query.subjectPersonProfiles.findFirst({
        where: eq(subjectPersonProfiles.subjectId, id),
      })
      if (!profile) {
        return { success: false, error: 'Person profile not found — data integrity issue.' }
      }
      return { success: true, data: { type: 'PERSON', subject, profile, addresses, roles } }
    }

    if (subject.type === 'COMPANY') {
      const profile = await db.query.subjectCompanyProfiles.findFirst({
        where: eq(subjectCompanyProfiles.subjectId, id),
      })
      if (!profile) {
        return { success: false, error: 'Company profile not found — data integrity issue.' }
      }
      return { success: true, data: { type: 'COMPANY', subject, profile, addresses, roles } }
    }

    return { success: false, error: `Unknown subject type: ${subject.type}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── listSubjects ───────────────────────────────────────────────────

export type SubjectListItem = {
  id: string
  type: string
  displayName: string
  email: string | null
  phone: string | null
  tags: string[] | null
  createdAt: Date
}

export async function listSubjects(
  query: ListSubjectsQueryInput = {},
): Promise<ActionResult<{ items: SubjectListItem[]; total: number }>> {
  const parsed = listSubjectsQuerySchema.safeParse(query)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { search, type, role, limit, offset } = parsed.data

  try {
    // Resolve subject IDs filtered by role first, if needed
    let roleFilteredIds: string[] | undefined

    if (role) {
      const roleRows = await db
        .select({ subjectId: subjectRoles.subjectId })
        .from(subjectRoles)
        .where(eq(subjectRoles.role, role))

      roleFilteredIds = roleRows.map((r) => r.subjectId)

      // No subjects have this role — short-circuit
      if (roleFilteredIds.length === 0) {
        return { success: true, data: { items: [], total: 0 } }
      }
    }

    // Build where conditions
    const conditions = []

    if (type) {
      conditions.push(eq(subjects.type, type))
    }

    if (search) {
      conditions.push(ilike(subjects.displayName, `%${search}%`))
    }

    if (roleFilteredIds) {
      conditions.push(inArray(subjects.id, roleFilteredIds))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const rows = await db
      .select({
        id: subjects.id,
        type: subjects.type,
        displayName: subjects.displayName,
        email: subjects.email,
        phone: subjects.phone,
        tags: subjects.tags,
        createdAt: subjects.createdAt,
      })
      .from(subjects)
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(subjects.displayName)

    // Total count for pagination — separate query, intentionally simple for Phase 1
    const allRows = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(where)

    return {
      success: true,
      data: { items: rows, total: allRows.length },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
