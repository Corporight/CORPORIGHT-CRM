'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { terminateRelation } from '@/lib/relations/actions'

export function TerminateForm({
  relationId,
  validFrom,
}: {
  relationId: string
  validFrom: string | null // YYYY-MM-DD — used as min on the date input
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const reason = (form.elements.namedItem('reason') as HTMLTextAreaElement).value
    const validTo = (form.elements.namedItem('validTo') as HTMLInputElement).value

    setError(null)
    startTransition(async () => {
      const result = await terminateRelation({
        relationId,
        reason,
        validTo, // preprocess normalises '' → undefined
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
        className="px-4 py-2 border border-red-300 text-red-700 rounded-md text-sm hover:bg-red-50 transition-colors"
      >
        Terminate relation
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-red-200 rounded-lg p-4 bg-red-50 space-y-3 max-w-lg"
    >
      <p className="text-sm font-medium text-red-800">Terminate this relation</p>

      <div>
        <label className="block text-xs text-gray-600 mb-1">
          Reason <span className="text-red-500">*</span>
        </label>
        <textarea
          name="reason"
          required
          rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 bg-white"
          placeholder="Reason for termination…"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">
          Termination date{' '}
          <span className="text-gray-400">(leave blank to use today)</span>
        </label>
        <input
          type="date"
          name="validTo"
          min={validFrom ?? undefined}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Terminating…' : 'Confirm termination'}
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
