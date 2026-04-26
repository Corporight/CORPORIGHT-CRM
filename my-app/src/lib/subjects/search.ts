'use server'

import { db } from '@/db'
import { subjects, subjectCompanyProfiles } from '@/db/schema'
import { ilike, and, eq, or } from 'drizzle-orm'

export type SubjectSearchResult = {
  id: string
  displayName: string
  type: string
  registrationNumber: string | null
}

export async function searchSubjects(query: string): Promise<SubjectSearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const rows = await db
    .select({
      id: subjects.id,
      displayName: subjects.displayName,
      type: subjects.type,
      registrationNumber: subjectCompanyProfiles.registrationNumber,
    })
    .from(subjects)
    .leftJoin(subjectCompanyProfiles, eq(subjects.id, subjectCompanyProfiles.subjectId))
    .where(
      and(
        eq(subjects.isActive, true),
        or(
          ilike(subjects.displayName, `%${q}%`),
          ilike(subjectCompanyProfiles.registrationNumber, `%${q}%`),
        ),
      ),
    )
    .limit(10)

  return rows
}

// Server-side lookup by UUID — used by the New Relation page to resolve a
// pre-filled subjectAId query param to a display name for the SubjectPicker.
export async function getSubjectSummary(id: string): Promise<SubjectSearchResult | null> {
  const rows = await db
    .select({
      id: subjects.id,
      displayName: subjects.displayName,
      type: subjects.type,
      registrationNumber: subjectCompanyProfiles.registrationNumber,
    })
    .from(subjects)
    .leftJoin(subjectCompanyProfiles, eq(subjects.id, subjectCompanyProfiles.subjectId))
    .where(eq(subjects.id, id))
    .limit(1)

  return rows[0] ?? null
}
