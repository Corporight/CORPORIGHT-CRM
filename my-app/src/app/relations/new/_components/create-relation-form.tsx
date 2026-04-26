'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createRelation } from '@/lib/relations/actions'
import { RELATION_TYPES } from '@/db/schema'
import { SubjectPicker } from '@/components/subject-picker'
import type { SubjectSearchResult } from '@/lib/subjects/search'

const INPUT =
  'border border-gray-300 rounded-md px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-400'

const SELECT =
  'border border-gray-300 rounded-md px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50'

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

const RELATION_TYPE_LABELS: Record<string, string> = {
  SHAREHOLDER: 'Shareholder',
  DIRECTOR: 'Director',
  PROCURIST: 'Procurist',
  BENEFICIAL_OWNER: 'Beneficial owner',
  REPRESENTATIVE: 'Representative',
}

export function CreateRelationForm({ defaultSubjectA }: { defaultSubjectA?: SubjectSearchResult }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const val = (name: string) =>
      (
        form.elements.namedItem(name) as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement
      ).value

    const subjectAIdValue = val('subjectAId').trim()
    const subjectBIdValue = val('subjectBId').trim()
    const relationType = val('relationType') as (typeof RELATION_TYPES)[number]
    const validFrom = val('validFrom') || undefined
    const shareRaw = val('sharePercentage').trim()
    const sharePercentage = shareRaw === '' ? undefined : parseFloat(shareRaw)
    const noteInternal = val('noteInternal') // preprocess normalises '' → null

    setError(null)
    startTransition(async () => {
      const result = await createRelation({
        subjectAId: subjectAIdValue,
        subjectBId: subjectBIdValue,
        relationType,
        ...(validFrom !== undefined ? { validFrom } : {}),
        ...(sharePercentage !== undefined ? { sharePercentage } : {}),
        noteInternal, // always pass — preprocess normalises '' → null
      })
      if (result.success) {
        router.push(`/relations/${result.data.id}`)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <SubjectPicker
        name="subjectAId"
        label="Subject A"
        hint="The acting side — e.g. the person who is a director or shareholder."
        defaultValue={defaultSubjectA}
        required
      />

      <SubjectPicker
        name="subjectBId"
        label="Subject B"
        hint="The target side — e.g. the company being directed."
        required
      />

      <Field label="Relation type" required>
        <select name="relationType" required defaultValue="" className={SELECT}>
          <option value="" disabled>
            Select type…
          </option>
          {RELATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {RELATION_TYPE_LABELS[t] ?? t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Valid from">
        <input
          type="date"
          name="validFrom"
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
      </Field>

      <Field label="Share %">
        <div className="flex items-center gap-2">
          <input
            type="number"
            name="sharePercentage"
            min={0}
            max={100}
            step="0.01"
            placeholder="e.g. 50"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
          <span className="text-xs text-gray-400">optional</span>
        </div>
      </Field>

      <Field label="Internal note">
        <textarea
          name="noteInternal"
          rows={3}
          placeholder="Internal note…"
          className={INPUT}
        />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Creating…' : 'Create relation'}
        </button>
      </div>
    </form>
  )
}
