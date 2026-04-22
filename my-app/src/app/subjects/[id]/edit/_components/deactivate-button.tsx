'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deactivateSubject } from '@/lib/subjects/actions'

export function DeactivateButton({ id, displayName }: { id: string; displayName: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (
      !window.confirm(
        `Deactivate "${displayName}"?\n\nThe subject will be hidden from the active subjects list. Addresses and roles are preserved.`,
      )
    ) {
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await deactivateSubject(id)
      if (result.success) {
        router.push('/subjects')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="border border-red-300 text-red-600 px-4 py-2 rounded-md text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? 'Deactivating…' : 'Deactivate subject'}
      </button>
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
