import { listOrders } from '@/lib/orders/actions'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  ORDER_TYPE_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
} from '@/lib/orders/labels'
import Link from 'next/link'

export default async function OrdersPage() {
  const result = await listOrders()

  if (!result.success) {
    return (
      <div className="px-6 py-8 max-w-7xl mx-auto">
        <p className="text-sm text-red-600">Chyba: {result.error}</p>
      </div>
    )
  }

  const { items } = result.data

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Objednávky</h1>
        <Link
          href="/orders/new"
          className="px-4 py-2 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-700"
        >
          Nová objednávka
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400">Žádné objednávky.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Číslo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Typ
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Klient
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stav
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Platba
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Termín
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vytvořeno
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {order.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {order.clientDisplayName ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        ORDER_STATUS_STYLES[order.status] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${
                        PAYMENT_STATUS_STYLES[order.paymentStatus] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {order.dueDate
                      ? new Date(order.dueDate + 'T00:00:00').toLocaleDateString('cs-CZ')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {order.createdAt.toLocaleDateString('cs-CZ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
