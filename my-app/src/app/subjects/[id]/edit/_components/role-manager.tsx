'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addRole, deactivateRole } from '@/lib/subjects/actions'

type SubjectRole = {
  id: string
  role: string
  isActive: boolean
}

const ROLE_LABELS: Record<string, string> = {
  CLIENT: 'Client',
  SUPPLIER: 'Supplier',
  PARTNER: 'Partner',
  OTHER: 'Other',
}

const ALL_ROLES = ['CLIENT', 'SUPPLIER', 'PARTNER', 'OTHER'] as const

const SELECT =
  'border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50'

export function RoleManager({
  subjectId,
  roles,
}: {
  subjectId: string
  roles: SubjectRole[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [newRole, setNewRole] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const activeRoleCodes = roles.map(r => r.role)
  const availableRoles = ALL_ROLES.filter(r => !activeRoleCodes.includes(r))

  function handleAdd() {
    if (!newRole) return
    setError(null)
    startTransition(async () => {
      const result = await addRole(subjectId, {
        role: newRole as 'CLIENT' | 'SUPPLIER' | 'PARTNER' | 'OTHER',
      })
      if (result.success) {
        setNewRole('')
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function handleRemove(roleId: string, roleCode: string) {
    if (!window.confirm(`Remove role "${ROLE_LABELS[roleCode] ?? roleCode}"?`)) return
    setError(null)
    startTransition(async () => {
      const result = await deactivateRole(roleId)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 pb-1.5 mb-4">
        Roles
      </div>

      {roles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {roles.map(r => (
            <span
              key={r.id}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700"
            >
              {ROLE_LABELS[r.role] ?? r.role}
              <button
                type="button"
                onClick={() => handleRemove(r.id, r.role)}
                disabled={isPending}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-50 leading-none"
                aria-label={`Remove ${ROLE_LABELS[r.role] ?? r.role}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {availableRoles.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            className={SELECT}
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            disabled={isPending}
          >
            <option value="">Add a role…</option>
            {availableRoles.map(r => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={isPending || !newRole}
            className="shrink-0 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>
      )}

      {roles.length === 0 && availableRoles.length === 0 && (
        <p className="text-sm text-gray-400">All roles assigned.</p>
      )}

      {error && (
        <p className="text-sm text-red-600 mt-2">{error}</p>
      )}
    </section>
  )
}
