'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createOrder } from '@/lib/orders/actions'
import { SubjectPicker } from '@/components/subject-picker'
import { ORDER_TYPES, type OrderType } from '@/db/schema'
import { ORDER_TYPE_LABELS } from '@/lib/orders/labels'

export function CreateOrderForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    const orderType = formData.get('orderType') as string
    const clientSubjectId = (formData.get('clientSubjectId') as string) || undefined
    const dueDate = (formData.get('dueDate') as string) || undefined
    const notes = (formData.get('notes') as string) || undefined

    startTransition(async () => {
      const result = await createOrder({
        orderType: orderType as OrderType,
        clientSubjectId,
        dueDate,
        notes,
      })

      if (!result.success) {
        setError(result.error)
        return
      }

      router.push(`/orders/${result.data.id}`)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Typ objednávky <span className="text-red-500">*</span>
        </label>
        <select
          name="orderType"
          required
          defaultValue=""
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        >
          <option value="" disabled>Vyberte typ…</option>
          {ORDER_TYPES.map((type) => (
            <option key={type} value={type}>
              {ORDER_TYPE_LABELS[type] ?? type}
            </option>
          ))}
        </select>
      </div>

      <SubjectPicker
        name="clientSubjectId"
        label="Klient"
        hint="Vyhledejte klienta jménem nebo IČO"
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Termín
        </label>
        <input
          type="date"
          name="dueDate"
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Poznámky
        </label>
        <textarea
          name="notes"
          rows={3}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Vytváření…' : 'Vytvořit objednávku'}
        </button>
        <a
          href="/orders"
          className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Zrušit
        </a>
      </div>
    </form>
  )
}
