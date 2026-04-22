'use client'

import { useRouter } from 'next/navigation'

type Props = {
  relationType?: string
  status: string
  subjectId?: string
}

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'SHAREHOLDER', label: 'Shareholder' },
  { value: 'DIRECTOR', label: 'Director' },
  { value: 'PROCURIST', label: 'Procurist' },
  { value: 'BENEFICIAL_OWNER', label: 'Beneficial owner' },
  { value: 'REPRESENTATIVE', label: 'Representative' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'historical', label: 'Historical' },
]

export function RelationsFilters({ relationType, status, subjectId }: Props) {
  const router = useRouter()

  function buildUrl(overrides: Record<string, string>): string {
    const params: Record<string, string> = {}
    if (relationType) params.relationType = relationType
    if (status !== 'active') params.status = status
    if (subjectId) params.subjectId = subjectId
    Object.assign(params, overrides)
    delete params.offset
    for (const k of Object.keys(params)) {
      if (!params[k]) delete params[k]
    }
    const qs = new URLSearchParams(params).toString()
    return `/relations${qs ? `?${qs}` : ''}`
  }

  function handleSelectChange(key: string, value: string) {
    router.replace(buildUrl({ [key]: value }))
  }

  function handleSubjectSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const value = (e.currentTarget.elements.namedItem('subjectId') as HTMLInputElement).value.trim()
    router.replace(buildUrl({ subjectId: value }))
  }

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <select
        value={relationType ?? ''}
        onChange={e => handleSelectChange('relationType', e.target.value)}
        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400"
      >
        {TYPE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={status}
        onChange={e => handleSelectChange('status', e.target.value)}
        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400"
      >
        {STATUS_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Subject filter — admin shortcut only. Primary path: link from /subjects/[id]. */}
      <form onSubmit={handleSubjectSubmit} className="flex gap-2 items-center">
        <input
          key={subjectId ?? ''}
          type="text"
          name="subjectId"
          defaultValue={subjectId ?? ''}
          placeholder="Subject UUID…"
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-64 font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <button
          type="submit"
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white hover:bg-gray-50 transition-colors"
        >
          Filter
        </button>
        {subjectId && (
          <button
            type="button"
            onClick={() => router.replace(buildUrl({ subjectId: '' }))}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white hover:bg-gray-50 transition-colors text-gray-500"
          >
            Clear
          </button>
        )}
      </form>
    </div>
  )
}
