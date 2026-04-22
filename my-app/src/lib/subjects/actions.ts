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
  subjectSettings,
} from '@/db/schema'
import { eq, ilike, and, inArray } from 'drizzle-orm'
import {
  createPersonSubjectSchema,
  createCompanySubjectSchema,
  listSubjectsQuerySchema,
  updateSubjectCoreSchema,
  updatePersonProfileSchema,
  updateCompanyProfileSchema,
  addAddressSchema,
  updateAddressSchema,
  type CreatePersonSubjectInput,
  type CreateCompanySubjectInput,
  type ListSubjectsQueryInput,
  type UpdateSubjectCoreInput,
  type UpdatePersonProfileInput,
  type UpdateCompanyProfileInput,
  type AddAddressInput,
  type UpdateAddressInput,
  addRoleSchema,
  type AddRoleInput,
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
        titleBefore: profile.titleBefore ?? null,
        titleAfter: profile.titleAfter ?? null,
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

      await tx.insert(subjectSettings).values({
        subjectId: subject.id,
        notificationsEmailEnabled: true,
        notificationsSmsEnabled: true,
        preferredLanguage: 'cs',
      })

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
        vatPayer: profile.vatPayer ?? false,
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

      await tx.insert(subjectSettings).values({
        subjectId: subject.id,
        notificationsEmailEnabled: true,
        notificationsSmsEnabled: true,
        preferredLanguage: 'cs',
      })

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
  isActive: boolean
  email: string | null
  phone: string | null
  tags: string[] | null
  createdAt: Date
  // Profile discriminators — one will be null depending on type
  registrationNumber: string | null
  birthDate: string | null
  // Active roles for this subject (batch-fetched, not joined)
  roles: string[]
}

export async function listSubjects(
  query: ListSubjectsQueryInput = {},
): Promise<ActionResult<{ items: SubjectListItem[]; total: number }>> {
  const parsed = listSubjectsQuerySchema.safeParse(query)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { search, type, role, isActive, limit, offset } = parsed.data

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

    if (isActive !== null) {
      conditions.push(eq(subjects.isActive, isActive))
    }

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
        isActive: subjects.isActive,
        email: subjects.email,
        phone: subjects.phone,
        tags: subjects.tags,
        createdAt: subjects.createdAt,
        registrationNumber: subjectCompanyProfiles.registrationNumber,
        birthDate: subjectPersonProfiles.birthDate,
      })
      .from(subjects)
      .leftJoin(subjectPersonProfiles, eq(subjectPersonProfiles.subjectId, subjects.id))
      .leftJoin(subjectCompanyProfiles, eq(subjectCompanyProfiles.subjectId, subjects.id))
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(subjects.displayName)

    // Batch-fetch active roles for the returned subjects (avoids N+1)
    const roleRows = rows.length > 0
      ? await db
          .select({ subjectId: subjectRoles.subjectId, role: subjectRoles.role })
          .from(subjectRoles)
          .where(and(inArray(subjectRoles.subjectId, rows.map(r => r.id)), eq(subjectRoles.isActive, true)))
      : []

    const rolesBySubjectId = new Map<string, string[]>()
    for (const r of roleRows) {
      const existing = rolesBySubjectId.get(r.subjectId) ?? []
      existing.push(r.role)
      rolesBySubjectId.set(r.subjectId, existing)
    }

    // Total count for pagination — separate query, intentionally simple for Phase 1
    const allRows = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(where)

    const items: SubjectListItem[] = rows.map(row => ({
      ...row,
      roles: rolesBySubjectId.get(row.id) ?? [],
    }))

    return {
      success: true,
      data: { items, total: allRows.length },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── updateSubjectCore ──────────────────────────────────────────────
// Updates the subjects row only (email, phone, notes, tags).
// displayName is derived — change it via updatePersonProfile / updateCompanyProfile.
// isActive is changed via deactivateSubject.

export async function updateSubjectCore(
  id: string,
  input: UpdateSubjectCoreInput,
): Promise<ActionResult<void>> {
  const parsed = updateSubjectCoreSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { email, phone, notes, tags } = parsed.data
  const updates = {
    ...(email !== undefined && { email }),
    ...(phone !== undefined && { phone }),
    ...(notes !== undefined && { notes }),
    ...(tags !== undefined && { tags }),
  }

  if (Object.keys(updates).length === 0) {
    return { success: true, data: undefined }
  }

  try {
    await db
      .update(subjects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(subjects.id, id))

    return { success: true, data: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── updatePersonProfile ────────────────────────────────────────────
// Updates subject_person_profiles.
// When firstName or lastName changes, subjects.display_name is re-derived
// inside the same transaction.

export async function updatePersonProfile(
  subjectId: string,
  input: UpdatePersonProfileInput,
): Promise<ActionResult<void>> {
  const parsed = updatePersonProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const {
    firstName, lastName, titleBefore, titleAfter,
    birthDate, birthNumber, nationality,
    idDocType, idDocNumber, idDocExpiry,
  } = parsed.data

  const profileUpdates = {
    ...(firstName !== undefined && { firstName }),
    ...(lastName !== undefined && { lastName }),
    ...(titleBefore !== undefined && { titleBefore }),
    ...(titleAfter !== undefined && { titleAfter }),
    ...(birthDate !== undefined && { birthDate }),
    ...(birthNumber !== undefined && { birthNumber }),
    ...(nationality !== undefined && { nationality }),
    ...(idDocType !== undefined && { idDocType }),
    ...(idDocNumber !== undefined && { idDocNumber }),
    ...(idDocExpiry !== undefined && { idDocExpiry }),
  }

  if (Object.keys(profileUpdates).length === 0) {
    return { success: true, data: undefined }
  }

  const nameChanging = firstName !== undefined || lastName !== undefined

  try {
    await db.transaction(async (tx) => {
      if (nameChanging) {
        const current = await tx.query.subjectPersonProfiles.findFirst({
          where: eq(subjectPersonProfiles.subjectId, subjectId),
        })
        if (!current) throw new Error('Person profile not found.')

        const newFirst = firstName ?? current.firstName
        const newLast = lastName ?? current.lastName

        await tx
          .update(subjects)
          .set({ displayName: `${newFirst} ${newLast}`, updatedAt: new Date() })
          .where(eq(subjects.id, subjectId))
      }

      await tx
        .update(subjectPersonProfiles)
        .set({ ...profileUpdates, updatedAt: new Date() })
        .where(eq(subjectPersonProfiles.subjectId, subjectId))
    })

    return { success: true, data: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── updateCompanyProfile ───────────────────────────────────────────
// Updates subject_company_profiles.
// When companyName changes, subjects.display_name is kept in sync
// inside the same transaction.

export async function updateCompanyProfile(
  subjectId: string,
  input: UpdateCompanyProfileInput,
): Promise<ActionResult<void>> {
  const parsed = updateCompanyProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const {
    companyName, registrationNumber, vatNumber,
    vatPayer, legalForm, registrationDate, registrationCourt,
  } = parsed.data

  const profileUpdates = {
    ...(companyName !== undefined && { companyName }),
    ...(registrationNumber !== undefined && { registrationNumber }),
    ...(vatNumber !== undefined && { vatNumber }),
    ...(vatPayer !== undefined && { vatPayer }),
    ...(legalForm !== undefined && { legalForm }),
    ...(registrationDate !== undefined && { registrationDate }),
    ...(registrationCourt !== undefined && { registrationCourt }),
  }

  if (Object.keys(profileUpdates).length === 0) {
    return { success: true, data: undefined }
  }

  try {
    await db.transaction(async (tx) => {
      if (companyName !== undefined) {
        await tx
          .update(subjects)
          .set({ displayName: companyName, updatedAt: new Date() })
          .where(eq(subjects.id, subjectId))
      }

      await tx
        .update(subjectCompanyProfiles)
        .set({ ...profileUpdates, updatedAt: new Date() })
        .where(eq(subjectCompanyProfiles.subjectId, subjectId))
    })

    return { success: true, data: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('unique') && message.includes('registration_number')) {
      return {
        success: false,
        error: `A company with registration number ${input.registrationNumber} already exists.`,
      }
    }
    return { success: false, error: message }
  }
}

// ── addAddress ─────────────────────────────────────────────────────
// Inserts a new address row for the subject.
// If isPrimary is true, clears the existing primary of the same type first
// (within a transaction) so the partial unique index is never violated.

export async function addAddress(
  subjectId: string,
  input: AddAddressInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = addAddressSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { addressType, street, city, postal, country, isPrimary } = parsed.data

  try {
    const result = await db.transaction(async (tx) => {
      if (isPrimary) {
        await tx
          .update(subjectAddresses)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(
            and(
              eq(subjectAddresses.subjectId, subjectId),
              eq(subjectAddresses.addressType, addressType),
              eq(subjectAddresses.isPrimary, true),
            ),
          )
      }

      const [row] = await tx
        .insert(subjectAddresses)
        .values({ subjectId, addressType, street, city, postal, country, isPrimary })
        .returning({ id: subjectAddresses.id })

      return row
    })

    return { success: true, data: result }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── updateAddress ──────────────────────────────────────────────────
// Updates the mutable content fields of an address (street, city, postal, country).
// addressType is structural and cannot be changed.
// isPrimary is changed via setAddressPrimary.
// isActive is changed via deactivateAddress.

export async function updateAddress(
  addressId: string,
  input: UpdateAddressInput,
): Promise<ActionResult<void>> {
  const parsed = updateAddressSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const { street, city, postal, country } = parsed.data
  const updates = {
    ...(street !== undefined && { street }),
    ...(city !== undefined && { city }),
    ...(postal !== undefined && { postal }),
    ...(country !== undefined && { country }),
  }

  if (Object.keys(updates).length === 0) {
    return { success: true, data: undefined }
  }

  try {
    await db
      .update(subjectAddresses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(subjectAddresses.id, addressId))

    return { success: true, data: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── deactivateAddress ──────────────────────────────────────────────
// Soft-deactivates an address. If the address is currently primary,
// isPrimary is cleared in the same UPDATE — releasing the partial unique
// index slot so a new primary can be set for this (subject, type).

export async function deactivateAddress(
  addressId: string,
): Promise<ActionResult<void>> {
  try {
    await db
      .update(subjectAddresses)
      .set({ isActive: false, isPrimary: false, updatedAt: new Date() })
      .where(eq(subjectAddresses.id, addressId))

    return { success: true, data: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── setAddressPrimary ──────────────────────────────────────────────
// Promotes one address to primary for its (subjectId, addressType).
// Runs in a transaction:
//   1. Clears any existing primary for that (subjectId, addressType).
//   2. Sets the target address as primary.
// Rejects if the target address is inactive.

export async function setAddressPrimary(
  addressId: string,
): Promise<ActionResult<void>> {
  try {
    await db.transaction(async (tx) => {
      const current = await tx.query.subjectAddresses.findFirst({
        where: eq(subjectAddresses.id, addressId),
      })

      if (!current) throw new Error('Address not found.')
      if (!current.isActive) throw new Error('Cannot set an inactive address as primary.')

      // Clear existing primary for this (subjectId, addressType)
      await tx
        .update(subjectAddresses)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(
          and(
            eq(subjectAddresses.subjectId, current.subjectId),
            eq(subjectAddresses.addressType, current.addressType),
            eq(subjectAddresses.isPrimary, true),
          ),
        )

      // Set the target as primary
      await tx
        .update(subjectAddresses)
        .set({ isPrimary: true, updatedAt: new Date() })
        .where(eq(subjectAddresses.id, addressId))
    })

    return { success: true, data: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── addRole ────────────────────────────────────────────────────────
// Assigns a role to a subject. The unique index on (subjectId, role) is
// non-partial — it covers inactive rows too — so a previously deactivated
// role cannot be re-inserted. The unique error is surfaced clearly;
// reactivation is out of scope for Phase 1.

export async function addRole(
  subjectId: string,
  input: AddRoleInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = addRoleSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  try {
    const [row] = await db
      .insert(subjectRoles)
      .values({ subjectId, role: parsed.data.role })
      .returning({ id: subjectRoles.id })

    return { success: true, data: row }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('unique')) {
      return {
        success: false,
        error: `Role ${parsed.data.role} is already assigned to this subject.`,
      }
    }
    return { success: false, error: message }
  }
}

// ── deactivateRole ─────────────────────────────────────────────────
// Soft-deactivates a role assignment. The row is retained so the unique
// index slot is preserved and the audit trail is intact.

export async function deactivateRole(
  roleId: string,
): Promise<ActionResult<void>> {
  try {
    await db
      .update(subjectRoles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(subjectRoles.id, roleId))

    return { success: true, data: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ── deactivateSubject ──────────────────────────────────────────────
// Soft-deactivates a subject. Addresses and roles are not cascaded —
// they remain intact for audit purposes and future reactivation.
// Inactive subjects are excluded from listSubjects by default.

export async function deactivateSubject(
  subjectId: string,
): Promise<ActionResult<void>> {
  try {
    await db
      .update(subjects)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(subjects.id, subjectId))

    return { success: true, data: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
}
