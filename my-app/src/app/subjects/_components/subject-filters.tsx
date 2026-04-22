'use client'

import { useRouter } from 'next/navigation'

type Props = {
  search?: string
  type?: string
  role?: string
  status: string
}

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'CLIENT', label: 'Client' },
  { value: 'SUPPLIER', label: 'Supplier' },
  { value: 'PARTNER', label: 'Partner' },
  { value: 'OTHER', label: 'Other' },
]

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'PERSON', label: 'Person' },
  { value: 'COMPANY', label: 'Company' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
]

export function SubjectFilters({ search, type, role, status }: Props) {
  const router = useRouter()

  function buildUrl(overrides: Record<string, string>): string {
    const params: Record<string, string> = {}
    if (search) params.search = search
    if (type) params.type = type
    if (role) params.role = role
    if (status !== 'active') params.status = status
    Object.assign(params, overrides)
    // Clean up empty values and reset pagination
    delete params.offset
    for (const k of Object.keys(params)) {
      if (!params[k]) delete params[k]
    }
    const qs = new URLSearchParams(params).toString()
    return `/subjects${qs ? `?${qs}` : ''}`
  }

  function handleSelectChange(key: string, value: string) {
    router.replace(buildUrl({ [key]: value }))
  }

  function handleSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const value = (e.currentTarget.elements.namedItem('search') as HTMLInputElement).value
    router.replace(buildUrl({ search: value }))
  }

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <input
          key={search ?? ''}
          type="text"
          name="search"
          defaultValue={search ?? ''}
          placeholder="Search by name…"
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <button
          type="submit"
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white hover:bg-gray-50"
        >
          Search
        </button>
      </form>

      <select
        value={type ?? ''}
        onChange={e => handleSelectChange('type', e.target.value)}
        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400"
      >
        {TYPE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select
        value={role ?? ''}
        onChange={e => handleSelectChange('role', e.target.value)}
        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400"
      >
        {ROLE_OPTIONS.map(o => (
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
    </div>
  )
}
