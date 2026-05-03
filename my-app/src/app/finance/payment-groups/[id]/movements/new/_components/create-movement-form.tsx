'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createFinancialMovement } from '@/lib/finance/actions'
import type {
  FinancialTreeCategoryListItem,
  FinancialTreeTypeListItem,
  FinancialTreeDetailListItem,
} from '@/lib/finance/actions'
import { DIRECTION_LABELS, VAT_MODE_LABELS } from '@/lib/finance/labels'

type Props = {
  pgId: string
  centerId: string
  centerCode: string
  centerName: string
  direction: string
  categories: FinancialTreeCategoryListItem[]
  types: FinancialTreeTypeListItem[]
  details: FinancialTreeDetailListItem[]
  defaultMovementDate: string
}

const inputClass =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400'

export function CreateMovementForm({
  pgId,
  centerId,
  centerCode,
  centerName,
  direction,
  categories,
  types,
  details,
  defaultMovementDate,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [selectedTypeId, setSelectedTypeId] = useState<string>('')
  const [selectedDetailId, setSelectedDetailId] = useState<string>('')

  const filteredTypes = selectedCategoryId
    ? types.filter((t) => t.categoryId === selectedCategoryId)
    : []
  const filteredDetails = selectedTypeId
    ? details.filter((d) => d.typeId === selectedTypeId)
    : []

  const [vatMode, setVatMode] = useState<'NO_VAT' | 'STANDARD' | 'REVERSE_CHARGE'>('NO_VAT')
  const [amountNet, setAmountNet] = useState<string>('')
  const [vatRate, setVatRate] = useState<string>('0')

  const vatRateNum = parseFloat(vatRate) || 0
  const amountNetNum = parseFloat(amountNet) || 0
  const vatAmountNum = vatMode === 'NO_VAT'
    ? 0
    : Math.round(amountNetNum * (vatRateNum / 100) * 100) / 100

  const amountGrossScaled = Math.round(amountNetNum * 100) + Math.round(vatAmountNum * 100)
  const amountGrossNum = amountGrossScaled / 100

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    const description = (formData.get('description') as string).trim()
    const movementDate = formData.get('movementDate') as string
    const categoryId = formData.get('categoryId') as string
    const typeId = formData.get('typeId') as string
    const detailId = formData.get('detailId') as string
    const note = (formData.get('note') as string) || undefined

    if (!description || !movementDate || !categoryId || !typeId || !detailId) {
      setError('Vyplňte prosím všechna povinná pole.')
      return
    }
    if (!amountNet || amountNetNum <= 0) {
      setError('Zadejte platnou částku.')
      return
    }

    startTransition(async () => {
      const result = await createFinancialMovement({
        paymentGroupId: pgId,
        centerId,
        direction: direction as 'INCOME' | 'EXPENSE' | 'INTERNAL',
        amountGross: amountGrossNum.toFixed(2),
        amountNet: amountNetNum.toFixed(2),
        vatAmount: vatAmountNum.toFixed(2),
        vatMode,
        vatRate: vatMode === 'NO_VAT' ? '0' : vatRate,
        categoryId,
        typeId,
        detailId,
        description,
        movementDate,
        note,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`/finance/payment-groups/${pgId}`)
    })
  }

  const directionLabel =
    (DIRECTION_LABELS as Record<string, string>)[direction] ?? direction

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Read-only context info */}
      <div className="rounded-md bg-gray-50 border border-gray-200 px-4 py-3 text-sm space-y-1">
        <div>
          <span className="text-gray-500">Středisko:</span>{' '}
          <span className="font-medium">
            {centerCode} – {centerName}
          </span>
        </div>
        <div>
          <span className="text-gray-500">Směr:</span>{' '}
          <span className="font-medium">{directionLabel}</span>
        </div>
      </div>

      {/* Datum pohybu */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Datum pohybu <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          name="movementDate"
          defaultValue={defaultMovementDate}
          required
          className={inputClass}
        />
      </div>

      {/* Popis */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Popis <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="description"
          required
          className={inputClass}
        />
      </div>

      {/* Kategorie */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Kategorie <span className="text-red-500">*</span>
        </label>
        <select
          name="categoryId"
          required
          defaultValue=""
          className={inputClass}
          onChange={(e) => {
            setSelectedCategoryId(e.target.value)
            setSelectedTypeId('')
            setSelectedDetailId('')
          }}
        >
          <option value="" disabled>
            Vyberte kategorii…
          </option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.code} – {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Typ */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Typ <span className="text-red-500">*</span>
        </label>
        <select
          name="typeId"
          required
          defaultValue=""
          className={inputClass}
          disabled={!selectedCategoryId}
          onChange={(e) => {
            setSelectedTypeId(e.target.value)
            setSelectedDetailId('')
          }}
        >
          <option value="" disabled>
            {selectedCategoryId ? 'Vyberte typ…' : 'Nejprve vyberte kategorii'}
          </option>
          {filteredTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} – {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Detail */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Detail <span className="text-red-500">*</span>
        </label>
        <select
          name="detailId"
          required
          value={selectedDetailId}
          onChange={(e) => setSelectedDetailId(e.target.value)}
          disabled={!selectedTypeId}
          className={inputClass}
        >
          <option value="" disabled>
            {selectedTypeId ? 'Vyberte detail…' : 'Nejprve vyberte typ'}
          </option>
          {filteredDetails.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} – {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Způsob DPH */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Způsob DPH <span className="text-red-500">*</span>
        </label>
        <select
          className={inputClass}
          value={vatMode}
          onChange={(e) => {
            const v = e.target.value as 'NO_VAT' | 'STANDARD' | 'REVERSE_CHARGE'
            setVatMode(v)
            if (v === 'NO_VAT') setVatRate('0')
          }}
        >
          {(Object.entries(VAT_MODE_LABELS) as [string, string][]).map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ),
          )}
        </select>
      </div>

      {/* Základ daně */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Základ daně (bez DPH) <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          name="amountNet"
          step="0.01"
          min="0.01"
          value={amountNet}
          onChange={(e) => setAmountNet(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* Sazba DPH — only when VAT applies */}
      {vatMode !== 'NO_VAT' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sazba DPH (%) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            name="vatRate"
            step="0.01"
            min="0"
            value={vatRate}
            onChange={(e) => setVatRate(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      {/* Computed amounts display */}
      <div className="rounded-md bg-gray-50 border border-gray-200 px-4 py-3 text-sm space-y-1">
        <p>
          <span className="text-gray-500">DPH:</span>{' '}
          <span className="font-medium">{vatAmountNum.toFixed(2)} Kč</span>
        </p>
        <p>
          <span className="text-gray-500">Hrubá částka:</span>{' '}
          <span className="font-medium">{amountGrossNum.toFixed(2)} Kč</span>
        </p>
      </div>

      {/* Poznámka */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Poznámka
        </label>
        <textarea name="note" rows={2} className={inputClass} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Vytváření…' : 'Vytvořit pohyb'}
        </button>
        <a
          href={`/finance/payment-groups/${pgId}`}
          className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Zrušit
        </a>
      </div>
    </form>
  )
}
