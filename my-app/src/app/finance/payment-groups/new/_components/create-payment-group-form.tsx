'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPaymentGroup } from '@/lib/finance/actions'

type CenterOption = { id: string; code: string; name: string }

const inputClass =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400'

export function CreatePaymentGroupForm({ centers }: { centers: CenterOption[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    const centerId = formData.get('centerId') as string
    const direction = formData.get('direction') as string
    const source = formData.get('source') as string
    const raw = formData.get('totalAmount') as string
    if (!raw || isNaN(parseFloat(raw))) {
      setError('Zadejte platnou částku.')
      return
    }
    const totalAmount = parseFloat(raw).toFixed(2)
    const transactionDate = formData.get('transactionDate') as string
    const counterpartyName = (formData.get('counterpartyName') as string) || undefined
    const variableSymbol = (formData.get('variableSymbol') as string) || undefined
    const constantSymbol = (formData.get('constantSymbol') as string) || undefined
    const specificSymbol = (formData.get('specificSymbol') as string) || undefined
    const note = (formData.get('note') as string) || undefined

    startTransition(async () => {
      const result = await createPaymentGroup({
        centerId,
        direction: direction as 'INCOME' | 'EXPENSE' | 'INTERNAL',
        source: source as 'MANUAL' | 'CASH',
        totalAmount,
        transactionDate,
        counterpartyName,
        variableSymbol,
        constantSymbol,
        specificSymbol,
        note,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`/finance/payment-groups/${result.data.id}`)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Středisko */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Středisko <span className="text-red-500">*</span>
        </label>
        <select name="centerId" required defaultValue="" className={inputClass}>
          <option value="" disabled>Vyberte středisko…</option>
          {centers.map((center) => (
            <option key={center.id} value={center.id}>
              {center.code} – {center.name}
            </option>
          ))}
        </select>
      </div>

      {/* Směr */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Směr <span className="text-red-500">*</span>
        </label>
        <select name="direction" required defaultValue="" className={inputClass}>
          <option value="" disabled>Vyberte směr…</option>
          <option value="INCOME">Příjem</option>
          <option value="EXPENSE">Výdaj</option>
          <option value="INTERNAL">Interní</option>
        </select>
      </div>

      {/* Zdroj */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Zdroj
        </label>
        <select name="source" defaultValue="MANUAL" className={inputClass}>
          <option value="MANUAL">Manuální</option>
          <option value="CASH">Hotovost</option>
        </select>
      </div>

      {/* Celková částka */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Celková částka <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          name="totalAmount"
          step="0.01"
          min="0.01"
          required
          className={inputClass}
        />
      </div>

      {/* Datum transakce */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Datum transakce <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          name="transactionDate"
          required
          className={inputClass}
        />
      </div>

      {/* Optional fields */}
      <div className="space-y-6 pt-2 border-t border-gray-200">
        {/* Protistrana */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Protistrana
          </label>
          <input
            type="text"
            name="counterpartyName"
            className={inputClass}
          />
        </div>

        {/* Variabilní symbol */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Variabilní symbol
          </label>
          <input
            type="text"
            name="variableSymbol"
            className={inputClass}
          />
        </div>

        {/* Konstantní symbol */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Konstantní symbol
          </label>
          <input
            type="text"
            name="constantSymbol"
            className={inputClass}
          />
        </div>

        {/* Specifický symbol */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Specifický symbol
          </label>
          <input
            type="text"
            name="specificSymbol"
            className={inputClass}
          />
        </div>

        {/* Poznámka */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Poznámka
          </label>
          <textarea
            name="note"
            rows={2}
            className={inputClass}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Vytváření…' : 'Vytvořit'}
        </button>
        <a
          href="/finance/payment-groups"
          className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Zrušit
        </a>
      </div>
    </form>
  )
}
