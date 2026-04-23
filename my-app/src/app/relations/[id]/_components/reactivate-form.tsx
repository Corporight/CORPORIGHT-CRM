'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reactivateRelation } from '@/lib/relations/actions'

export function ReactivateForm({ relationId }: { relationId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const reason = (e.currentTarget.elements.namedItem('reason') as HTMLTextAreaElement).value

    setError(null)
    startTransition(async () => {
      const result = await reactivateRelation({ relationId, reason })
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-lg">
      <div>
        <label className="block text-xs text-gray-600 mb-1">
          Reason <span className="text-red-500">*</span>
        </label>
        <textarea
          name="reason"
          required
          rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          placeholder="Reason for reactivation…"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Reactivating…' : 'Reactivate relation'}
      </button>
    </form>
  )
}
