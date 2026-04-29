'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateOrderStatus } from '@/lib/orders/actions'
import { ORDER_STATUS_LABELS } from '@/lib/orders/labels'
import type { OrderStatus } from '@/db/schema'

// Mirrors the state machine in actions.ts — authoritative validation is server-side.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  CONCEPT: ['WAITING_FOR_PAYMENT', 'DOCUMENT_PREPARATION', 'CANCELLED'],
  WAITING_FOR_PAYMENT: ['DOCUMENT_PREPARATION', 'CANCELLED'],
  DOCUMENT_PREPARATION: ['WAITING_FOR_DOCUMENTS', 'CANCELLED'],
  WAITING_FOR_DOCUMENTS: ['EXECUTION', 'CANCELLED'],
  EXECUTION: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

export function UpdateStatusForm({
  orderId,
  currentStatus,
}: {
  orderId: string
  currentStatus: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? []
  if (allowed.length === 0) return null

  function handleTransition(newStatus: string) {
    if (
      newStatus === 'CANCELLED' &&
      !window.confirm('Opravdu chcete zrušit tuto objednávku? Tato akce je nevratná.')
    ) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await updateOrderStatus({
        orderId,
        newStatus: newStatus as OrderStatus,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="mt-6 pt-4 border-t">
      <p className="text-xs text-muted-foreground mb-2">Posunout stav:</p>
      <div className="flex flex-wrap gap-2">
        {allowed.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => handleTransition(status)}
            disabled={isPending}
            className={[
              'px-3 py-1.5 text-xs font-medium rounded border transition-colors disabled:opacity-50',
              status === 'CANCELLED'
                ? 'border-red-300 text-red-600 hover:bg-red-50'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50',
            ].join(' ')}
          >
            {ORDER_STATUS_LABELS[status] ?? status}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
