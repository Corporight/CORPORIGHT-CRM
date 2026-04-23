'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateRelation } from '@/lib/relations/actions'

export function UpdateRelationForm({
  relationId,
  currentSharePercentage,
  currentNoteInternal,
}: {
  relationId: string
  currentSharePercentage: string | null
  currentNoteInternal: string | null
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const shareRaw = (form.elements.namedItem('sharePercentage') as HTMLInputElement).value.trim()
    const noteInternal = (form.elements.namedItem('noteInternal') as HTMLTextAreaElement).value
    const reason = (form.elements.namedItem('reason') as HTMLTextAreaElement).value

    // Empty share input → null (clear); otherwise parse as number.
    // Backend normalizeNote handles empty/whitespace noteInternal → null.
    // Both fields are always sent so the backend refine (at least one provided) always passes.
    const sharePercentage: number | null = shareRaw === '' ? null : parseFloat(shareRaw)

    setError(null)
    startTransition(async () => {
      const result = await updateRelation({
        relationId,
        sharePercentage,
        noteInternal,
        reason,
      })
      if (result.success) {
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 transition-colors"
      >
        Edit share / note
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-gray-200 rounded-lg p-4 space-y-3 max-w-lg"
    >
      <p className="text-sm font-medium text-gray-800">Edit relation details</p>

      <div>
        <label className="block text-xs text-gray-600 mb-1">Share %</label>
        <input
          type="number"
          name="sharePercentage"
          defaultValue={currentSharePercentage ?? ''}
          min={0}
          max={100}
          step="0.01"
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-gray-400"
          placeholder="e.g. 50"
        />
        <span className="text-xs text-gray-400 ml-2">Leave blank to clear</span>
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">Internal note</label>
        <textarea
          name="noteInternal"
          defaultValue={currentNoteInternal ?? ''}
          rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          placeholder="Internal note…"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">
          Reason <span className="text-red-500">*</span>
        </label>
        <textarea
          name="reason"
          required
          rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          placeholder="Reason for this change…"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="px-4 py-2 border border-gray-300 text-gray-600 rounded-md text-sm hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
