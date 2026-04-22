import Link from 'next/link'
import { listRelations } from '@/lib/relations/actions'
import { RELATION_TYPES } from '@/db/schema'
import { RelationsFilters } from './_components/relations-filters'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

function str(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function fmtDate(value: Date | null | undefined): string {
  if (!value) return '—'
  return value.toLocaleDateString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
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
  return `/relations${qs ? `?${qs}` : ''}`
}

const RELATION_TYPE_LABELS: Record<string, string> = {
  SHAREHOLDER: 'Shareholder',
  DIRECTOR: 'Director',
  PROCURIST: 'Procurist',
  BENEFICIAL_OWNER: 'Beneficial owner',
  REPRESENTATIVE: 'Representative',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const LIMIT = 50

export default async function RelationsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams

  const rawType = str(sp.relationType)
  const relationType =
    rawType && (RELATION_TYPES as readonly string[]).includes(rawType)
      ? (rawType as (typeof RELATION_TYPES)[number])
      : undefined

  const status = str(sp.status) === 'historical' ? 'historical' : 'active'
  const isActive = status !== 'historical'

  const rawSubjectId = str(sp.subjectId)
  const subjectId = rawSubjectId && UUID_RE.test(rawSubjectId) ? rawSubjectId : undefined

  const offset = Math.max(0, parseInt(str(sp.offset) ?? '0', 10) || 0)

  const result = await listRelations({ relationType, isActive, subjectId, limit: LIMIT, offset })

  const items = result.success ? result.data.items : []
  const total = result.success ? result.data.total : 0
  const hasPrev = offset > 0
  const hasNext = offset + LIMIT < total

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Relations</h1>
        <Link
          href="/relations/new"
          className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm hover:bg-gray-700 transition-colors"
        >
          + New Relation
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <RelationsFilters relationType={relationType} status={status} subjectId={rawSubjectId} />
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
                <th className="px-4 py-3 font-medium text-gray-500">Subject A</th>
                <th className="px-4 py-3 font-medium text-gray-500">Subject B</th>
                <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Share %</th>
                <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Valid from</th>
                <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap">Valid to</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    No relations found.
                  </td>
                </tr>
              ) : (
                items.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/relations/${item.id}`}>
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                          {RELATION_TYPE_LABELS[item.relationType] ?? item.relationType}
                        </span>
                      </Link>
                    </td>

                    <td className="px-4 py-3">
                      <Link
                        href={`/subjects/${item.subjectAId}`}
                        className="text-gray-900 hover:text-blue-600"
                      >
                        {item.subjectAName}
                      </Link>
                    </td>

                    <td className="px-4 py-3">
                      <Link
                        href={`/subjects/${item.subjectBId}`}
                        className="text-gray-900 hover:text-blue-600"
                      >
                        {item.subjectBName}
                      </Link>
                    </td>

                    <td className="px-4 py-3 text-gray-600 font-mono text-xs whitespace-nowrap">
                      {item.sharePercentage != null ? (
                        `${item.sharePercentage}%`
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {fmtDate(item.validFrom)}
                    </td>

                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {fmtDate(item.validTo)}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          item.isActive
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {item.isActive ? 'Active' : 'Historical'}
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
