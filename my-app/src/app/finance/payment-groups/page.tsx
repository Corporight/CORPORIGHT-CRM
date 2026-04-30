import Link from 'next/link'
import { listPaymentGroups } from '@/lib/finance/actions'
import {
  DIRECTION_LABELS,
  PROCESSING_STATUS_LABELS,
  SOURCE_LABELS,
} from '@/lib/finance/labels'
import { formatCZK } from '@/lib/format'

function directionBadge(direction: string): string {
  if (direction === 'INCOME') return 'bg-green-100 text-green-800'
  if (direction === 'EXPENSE') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-700'
}

function statusBadge(status: string): string {
  if (status === 'FULLY_ALLOCATED') return 'bg-green-100 text-green-800'
  if (status === 'PARTIALLY_ALLOCATED') return 'bg-yellow-100 text-yellow-800'
  if (status === 'CANCELLED') return 'bg-gray-100 text-gray-500'
  return 'bg-blue-100 text-blue-800'
}

const VALID_DIRECTIONS = ['INCOME', 'EXPENSE', 'INTERNAL'] as const
const VALID_STATUSES = ['NEW', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED', 'CANCELLED'] as const

export default async function PaymentGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams

  const rawDir = typeof sp.direction === 'string' ? sp.direction : undefined
  const direction =
    rawDir && (VALID_DIRECTIONS as readonly string[]).includes(rawDir)
      ? (rawDir as 'INCOME' | 'EXPENSE' | 'INTERNAL')
      : undefined

  const rawStatus = typeof sp.processingStatus === 'string' ? sp.processingStatus : undefined
  const processingStatus =
    rawStatus && (VALID_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as 'NEW' | 'PARTIALLY_ALLOCATED' | 'FULLY_ALLOCATED' | 'CANCELLED')
      : undefined

  const result = await listPaymentGroups({ direction, processingStatus })

  if (!result.success) {
    return (
      <div className="px-6 py-8 max-w-7xl mx-auto">
        <p className="text-sm text-red-600">Chyba při načítání platebních skupin: {result.error}</p>
      </div>
    )
  }

  const { items, total } = result.data

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Platební skupiny</h1>
        <Link
          href="/finance/payment-groups/new"
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          Nová platba
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Žádné platební skupiny.</p>
      ) : (
        <>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Datum transakce
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Směr
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Zdroj
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Celková částka
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Alokováno
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Zbývá
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stav
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Protistrana
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {items.map((item) => {
                  const remaining = parseFloat(
                    (parseFloat(item.totalAmount) - parseFloat(item.allocatedAmount)).toFixed(2)
                  )
                  const formattedDate = new Date(
                    item.transactionDate + 'T00:00:00'
                  ).toLocaleDateString('cs-CZ')

                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-blue-600 hover:underline">
                        <Link href={`/finance/payment-groups/${item.id}`}>
                          {formattedDate}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${directionBadge(item.direction)}`}
                        >
                          {DIRECTION_LABELS[item.direction as keyof typeof DIRECTION_LABELS] ?? item.direction}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {SOURCE_LABELS[item.source as keyof typeof SOURCE_LABELS] ?? item.source}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-gray-900 font-medium">
                        {formatCZK(item.totalAmount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-gray-700">
                        {formatCZK(item.allocatedAmount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-gray-700">
                        {formatCZK(remaining)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge(item.processingStatus)}`}
                        >
                          {PROCESSING_STATUS_LABELS[item.processingStatus as keyof typeof PROCESSING_STATUS_LABELS] ?? item.processingStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {item.counterpartyName ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </div>
          <p className="mt-4 text-sm text-gray-500">Celkem: {total} záznamů</p>
        </>
      )}
    </div>
  )
}
