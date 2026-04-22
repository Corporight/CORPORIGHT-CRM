import Link from 'next/link'
import { listSubjects } from '@/lib/subjects/actions'
import { SubjectFilters } from './_components/subject-filters'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

const ROLE_LABELS: Record<string, string> = {
  CLIENT: 'Client',
  SUPPLIER: 'Supplier',
  PARTNER: 'Partner',
  OTHER: 'Other',
}

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function paginationUrl(
  sp: { [key: string]: string | string[] | undefined },
  offset: number,
): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && k !== 'offset') params.set(k, v)
  }
  if (offset > 0) params.set('offset', String(offset))
  const qs = params.toString()
  return `/subjects${qs ? `?${qs}` : ''}`
}

const LIMIT = 50

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams

  const search = str(sp.search)
  const rawType = str(sp.type)
  const type =
    rawType === 'PERSON' || rawType === 'COMPANY' ? rawType : undefined
  const rawRole = str(sp.role)
  const role =
    rawRole === 'CLIENT' ||
    rawRole === 'SUPPLIER' ||
    rawRole === 'PARTNER' ||
    rawRole === 'OTHER'
      ? rawRole
      : undefined
  const status = str(sp.status) ?? 'active'
  const isActive =
    status === 'inactive' ? false : status === 'all' ? null : true
  const offset = Math.max(0, parseInt(str(sp.offset) ?? '0', 10) || 0)

  const result = await listSubjects({
    search,
    type,
    role,
    isActive,
    limit: LIMIT,
    offset,
  })

  const total = result.success ? result.data.total : 0
  const items = result.success ? result.data.items : []
  const hasPrev = offset > 0
  const hasNext = offset + LIMIT < total

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Subjects</h1>
        <Link
          href="/subjects/new"
          className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm hover:bg-gray-700 transition-colors"
        >
          + New Subject
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <SubjectFilters
          search={search}
          type={type}
          role={role}
          status={status}
        />
      </div>

      {/* Error state */}
      {!result.success && (
        <p className="text-sm text-red-600 mb-4">{result.error}</p>
      )}

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Type</th>
                <th className="px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">IČO / Birth date</th>
                <th className="px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="px-4 py-3 font-medium text-gray-500">Phone</th>
                <th className="px-4 py-3 font-medium text-gray-500">Roles</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    No subjects found.
                  </td>
                </tr>
              ) : (
                items.map(subject => (
                  <tr
                    key={subject.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {/* Type badge */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          subject.type === 'COMPANY'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-violet-50 text-violet-700'
                        }`}
                      >
                        {subject.type === 'COMPANY' ? 'Company' : 'Person'}
                      </span>
                    </td>

                    {/* Display name — links to detail (placeholder until detail page exists) */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/subjects/${subject.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {subject.displayName}
                      </Link>
                    </td>

                    {/* IČO for companies, birth date for persons */}
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs whitespace-nowrap">
                      {subject.registrationNumber ?? subject.birthDate ?? (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3 text-gray-600">
                      {subject.email ?? <span className="text-gray-300">—</span>}
                    </td>

                    {/* Phone */}
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {subject.phone ?? <span className="text-gray-300">—</span>}
                    </td>

                    {/* Roles */}
                    <td className="px-4 py-3">
                      {subject.roles.length === 0 ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {subject.roles.map(r => (
                            <span
                              key={r}
                              className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
                            >
                              {ROLE_LABELS[r] ?? r}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          subject.isActive
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {subject.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
        <span>
          {total === 0
            ? 'No results'
            : `${offset + 1}–${Math.min(offset + items.length, total)} of ${total}`}
        </span>
        <div className="flex gap-2">
          {hasPrev && (
            <Link
              href={paginationUrl(sp, offset - LIMIT)}
              className="px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              ← Previous
            </Link>
          )}
          {hasNext && (
            <Link
              href={paginationUrl(sp, offset + LIMIT)}
              className="px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
