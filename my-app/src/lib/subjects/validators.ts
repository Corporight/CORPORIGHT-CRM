import { z } from 'zod'

// ── Shared ─────────────────────────────────────────────────────────

const addressSchema = z.object({
  addressType: z.enum(['REGISTERED', 'MAILING', 'BILLING', 'OPERATIONAL']),
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  postal: z.string().min(1, 'Postal code is required'),
  country: z.string().default('CZ'),
})

// ── Create subject — PERSON ────────────────────────────────────────

export const createPersonSubjectSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  role: z.enum(['CLIENT', 'SUPPLIER', 'PARTNER', 'OTHER']).optional(),
  profile: z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    titleBefore: z.string().optional(),
    titleAfter: z.string().optional(),
    birthDate: z.string().optional(),       // ISO date: YYYY-MM-DD
    birthNumber: z.string().optional(),
    nationality: z.string().optional(),
    idDocType: z.enum(['PASSPORT', 'ID_CARD']).optional(),
    idDocNumber: z.string().optional(),
    idDocExpiry: z.string().optional(),     // ISO date: YYYY-MM-DD
  }),
  address: addressSchema.optional(),
})

export type CreatePersonSubjectInput = z.infer<typeof createPersonSubjectSchema>

// ── Create subject — COMPANY ───────────────────────────────────────

export const createCompanySubjectSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  role: z.enum(['CLIENT', 'SUPPLIER', 'PARTNER', 'OTHER']).optional(),
  profile: z.object({
    companyName: z.string().min(1, 'Company name is required'),
    registrationNumber: z.string().min(1, 'Registration number (IČO) is required'),
    vatNumber: z.string().optional(),
    vatPayer: z.boolean().optional(),
    legalForm: z.string().optional(),
    registrationDate: z.string().optional(), // ISO date: YYYY-MM-DD
    registrationCourt: z.string().optional(),
  }),
  address: addressSchema.optional(),
})

export type CreateCompanySubjectInput = z.infer<typeof createCompanySubjectSchema>

// ── List subjects ──────────────────────────────────────────────────

export const listSubjectsQuerySchema = z.object({
  search: z.string().optional(),
  type: z.enum(['PERSON', 'COMPANY']).optional(),
  role: z.enum(['CLIENT', 'SUPPLIER', 'PARTNER', 'OTHER']).optional(),
  isActive: z.boolean().nullable().default(true),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
})

// Output type (after Zod applies defaults — used internally)
export type ListSubjectsQuery = z.infer<typeof listSubjectsQuerySchema>
// Input type (before defaults — used as function parameter)
export type ListSubjectsQueryInput = z.input<typeof listSubjectsQuerySchema>

// ── Update subject core ────────────────────────────────────────────
// Covers only the fields on the subjects row itself.
// displayName is derived — update it via updatePersonProfile / updateCompanyProfile.
// isActive is changed via deactivateSubject (separate action).

export const updateSubjectCoreSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export type UpdateSubjectCoreInput = z.infer<typeof updateSubjectCoreSchema>

// ── Update person profile ──────────────────────────────────────────

export const updatePersonProfileSchema = z.object({
  firstName: z.string().min(1, 'First name cannot be empty').optional(),
  lastName: z.string().min(1, 'Last name cannot be empty').optional(),
  titleBefore: z.string().optional(),
  titleAfter: z.string().optional(),
  birthDate: z.string().optional(),     // ISO date: YYYY-MM-DD
  birthNumber: z.string().optional(),
  nationality: z.string().optional(),
  idDocType: z.enum(['PASSPORT', 'ID_CARD']).optional(),
  idDocNumber: z.string().optional(),
  idDocExpiry: z.string().optional(),   // ISO date: YYYY-MM-DD
})

export type UpdatePersonProfileInput = z.infer<typeof updatePersonProfileSchema>

// ── Update company profile ─────────────────────────────────────────

export const updateCompanyProfileSchema = z.object({
  companyName: z.string().min(1, 'Company name cannot be empty').optional(),
  registrationNumber: z.string().min(1, 'Registration number cannot be empty').optional(),
  vatNumber: z.string().optional(),
  vatPayer: z.boolean().optional(),
  legalForm: z.string().optional(),
  registrationDate: z.string().optional(), // ISO date: YYYY-MM-DD
  registrationCourt: z.string().optional(),
})

export type UpdateCompanyProfileInput = z.infer<typeof updateCompanyProfileSchema>

// ── Address management ─────────────────────────────────────────────
// addressType is structural — set at creation, never changed.
// isPrimary is managed via setAddressPrimary, not via updateAddress.
// isActive is managed via deactivateAddress, not via updateAddress.

export const addAddressSchema = z.object({
  addressType: z.enum(['REGISTERED', 'MAILING', 'BILLING', 'OPERATIONAL']),
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  postal: z.string().min(1, 'Postal code is required'),
  country: z.string().default('CZ'),
  isPrimary: z.boolean().default(false),
})

export type AddAddressInput = z.infer<typeof addAddressSchema>

export const updateAddressSchema = z.object({
  street: z.string().min(1, 'Street cannot be empty').optional(),
  city: z.string().min(1, 'City cannot be empty').optional(),
  postal: z.string().min(1, 'Postal code cannot be empty').optional(),
  country: z.string().optional(),
})

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>

// ── Role management ────────────────────────────────────────────────

export const addRoleSchema = z.object({
  role: z.enum(['CLIENT', 'SUPPLIER', 'PARTNER', 'OTHER']),
})

export type AddRoleInput = z.infer<typeof addRoleSchema>
