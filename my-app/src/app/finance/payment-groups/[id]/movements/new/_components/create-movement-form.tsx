'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createFinancialMovements } from '@/lib/finance/actions'
import type {
  FinancialTreeCategoryListItem,
  FinancialTreeTypeListItem,
  FinancialTreeDetailListItem,
} from '@/lib/finance/actions'
import type { OrderListItem } from '@/lib/orders/actions'
import { DIRECTION_LABELS, VAT_MODE_LABELS } from '@/lib/finance/labels'

type Props = {
  pgId: string
  centerId: string
  centerCode: string
  centerName: string
  direction: 'INCOME' | 'EXPENSE' | 'INTERNAL'
  categories: FinancialTreeCategoryListItem[]
  types: FinancialTreeTypeListItem[]
  details: FinancialTreeDetailListItem[]
  defaultMovementDate: string
  orders: OrderListItem[]
  ordersTruncated: boolean
}

function computeRowAmounts(row: RowState) {
  const amountNetNum = parseFloat(row.amountNet) || 0
  const vatRateNum = parseFloat(row.vatRate) || 0
  const vatAmountNum =
    row.vatMode === 'NO_VAT'
      ? 0
      : Math.round(amountNetNum * (vatRateNum / 100) * 100) / 100
  const amountGrossScaled =
    Math.round(amountNetNum * 100) + Math.round(vatAmountNum * 100)
  return {
    vatAmountNum,
    amountGrossNum: amountGrossScaled / 100,
  }
}

type RowState = {
  id: string
  selectedCategoryId: string
  selectedTypeId: string
  selectedDetailId: string
  vatMode: 'NO_VAT' | 'STANDARD' | 'REVERSE_CHARGE'
  amountNet: string
  vatRate: string
  description: string
  orderId: string
  note: string
}

function newEmptyRow(): RowState {
  return {
    id: crypto.randomUUID(),
    selectedCategoryId: '',
    selectedTypeId: '',
    selectedDetailId: '',
    vatMode: 'NO_VAT',
    amountNet: '',
    vatRate: '0',
    description: '',
    orderId: '',
    note: '',
  }
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
  orders,
  ordersTruncated,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<RowState[]>([newEmptyRow()])
  const [movementDate, setMovementDate] = useState<string>(defaultMovementDate)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const directionLabel =
    (DIRECTION_LABELS as Record<string, string>)[direction] ?? direction

  function updateRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, newEmptyRow()])
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev))
  }

  function filteredTypes(row: RowState) {
    return row.selectedCategoryId
      ? types.filter((t) => t.categoryId === row.selectedCategoryId)
      : []
  }

  function filteredDetails(row: RowState) {
    return row.selectedTypeId
      ? details.filter((d) => d.typeId === row.selectedTypeId)
      : []
  }

  const totalGross = rows.reduce(
    (sum, row) => sum + computeRowAmounts(row).amountGrossNum,
    0,
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGlobalError(null)

    if (!movementDate) {
      setGlobalError('Datum pohybu je povinné.')
      return
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row.selectedCategoryId || !row.selectedTypeId || !row.selectedDetailId) {
        setGlobalError(`Řádek ${i + 1}: Vyplňte kategorii, typ a detail.`)
        return
      }
      if (!row.description.trim()) {
        setGlobalError(`Řádek ${i + 1}: Popis je povinný.`)
        return
      }
      const net = parseFloat(row.amountNet)
      if (isNaN(net) || net <= 0) {
        setGlobalError(`Řádek ${i + 1}: Zadejte platnou částku.`)
        return
      }
    }

    startTransition(async () => {
      const result = await createFinancialMovements({
        paymentGroupId: pgId,
        centerId,
        direction,
        movementDate,
        rows: rows.map((row) => {
          const amountNetNum = parseFloat(row.amountNet)
          return {
            categoryId: row.selectedCategoryId,
            typeId: row.selectedTypeId,
            detailId: row.selectedDetailId,
            vatMode: row.vatMode,
            amountNet: amountNetNum.toFixed(2),
            vatRate: row.vatMode === 'NO_VAT' ? '0' : row.vatRate,
            description: row.description.trim(),
            orderId: row.orderId || undefined,
            note: row.note.trim() || undefined,
          }
        }),
      })
      if (!result.success) {
        setGlobalError(result.error)
        return
      }
      router.push(`/finance/payment-groups/${pgId}`)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Context info */}
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
          value={movementDate}
          onChange={(e) => setMovementDate(e.target.value)}
          required
          className={inputClass}
        />
      </div>

      {/* Rows section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-700">Pohyby</h2>
          <button
            type="button"
            onClick={addRow}
            className="text-xs font-medium px-3 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            + Přidat řádek
          </button>
        </div>

        <div className="space-y-4">
          {rows.map((row, index) => {
            const { vatAmountNum: vatAmount, amountGrossNum: gross } = computeRowAmounts(row)
            return (
              <div key={row.id} className="border border-gray-200 rounded-lg p-4 space-y-4">
                {/* Row header */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    Řádek {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ×
                  </button>
                </div>

                {/* Kategorie */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kategorie <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={row.selectedCategoryId}
                    onChange={(e) =>
                      updateRow(row.id, {
                        selectedCategoryId: e.target.value,
                        selectedTypeId: '',
                        selectedDetailId: '',
                      })
                    }
                    className={inputClass}
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
                    value={row.selectedTypeId}
                    disabled={!row.selectedCategoryId}
                    onChange={(e) =>
                      updateRow(row.id, {
                        selectedTypeId: e.target.value,
                        selectedDetailId: '',
                      })
                    }
                    className={inputClass}
                  >
                    <option value="" disabled>
                      {row.selectedCategoryId
                        ? 'Vyberte typ…'
                        : 'Nejprve vyberte kategorii'}
                    </option>
                    {filteredTypes(row).map((t) => (
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
                    value={row.selectedDetailId}
                    disabled={!row.selectedTypeId}
                    onChange={(e) =>
                      updateRow(row.id, { selectedDetailId: e.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="" disabled>
                      {row.selectedTypeId
                        ? 'Vyberte detail…'
                        : 'Nejprve vyberte typ'}
                    </option>
                    {filteredDetails(row).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} – {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Popis */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Popis <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={row.description}
                    onChange={(e) =>
                      updateRow(row.id, { description: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>

                {/* Způsob DPH */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Způsob DPH <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={row.vatMode}
                    onChange={(e) => {
                      const v = e.target.value as RowState['vatMode']
                      updateRow(row.id, {
                        vatMode: v,
                        vatRate: v === 'NO_VAT' ? '0' : row.vatRate,
                      })
                    }}
                    className={inputClass}
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
                    step="0.01"
                    min="0.01"
                    value={row.amountNet}
                    onChange={(e) =>
                      updateRow(row.id, { amountNet: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>

                {/* Sazba DPH — only when VAT applies */}
                {row.vatMode !== 'NO_VAT' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sazba DPH (%) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.vatRate}
                      onChange={(e) =>
                        updateRow(row.id, { vatRate: e.target.value })
                      }
                      className={inputClass}
                    />
                  </div>
                )}

                {/* Computed amounts summary */}
                <p className="text-sm text-gray-500">
                  DPH:{' '}
                  <span className="font-medium text-gray-700">
                    {vatAmount.toFixed(2)} Kč
                  </span>{' '}
                  | Hrubá:{' '}
                  <span className="font-medium text-gray-700">
                    {gross.toFixed(2)} Kč
                  </span>
                </p>

                {/* Zakázka */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zakázka
                  </label>
                  <select
                    value={row.orderId}
                    onChange={(e) =>
                      updateRow(row.id, { orderId: e.target.value })
                    }
                    className={inputClass}
                  >
                    <option value="">— (nepřiřazeno)</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.number}
                        {o.clientDisplayName ? ` – ${o.clientDisplayName}` : ''}
                      </option>
                    ))}
                  </select>
                  {ordersTruncated && (
                    <p className="text-xs text-amber-600 mt-1">
                      Zobrazeno prvních 50 zakázek. Použijte globální vyhledávání pro starší zakázky.
                    </p>
                  )}
                </div>

                {/* Poznámka */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Poznámka
                  </label>
                  <textarea
                    rows={2}
                    value={row.note}
                    onChange={(e) =>
                      updateRow(row.id, { note: e.target.value })
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer total */}
      <div className="rounded-md bg-gray-50 border border-gray-200 px-4 py-3 text-sm">
        <span className="text-gray-500">Celkem hrubá:</span>{' '}
        <span className="font-semibold">{totalGross.toFixed(2)} Kč</span>
      </div>

      {/* Global error */}
      {globalError && <p className="text-sm text-red-600">{globalError}</p>}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Vytváření…' : 'Vytvořit pohyby'}
        </button>
        <Link
          href={`/finance/payment-groups/${pgId}`}
          className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          Zrušit
        </Link>
      </div>
    </form>
  )
}
