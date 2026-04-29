import { notFound } from 'next/navigation'
import { getOrderDetail, type OrderDetail } from '@/lib/orders/reads'
import { OrderDetailHeader } from '@/components/orders/order-detail-header'
import { OrderDetailTabs } from '@/components/orders/order-detail-tabs'
import { OrderFinanceIncomeTab } from '@/components/orders/finance/order-finance-income-tab'
import { OrderFinanceExpensesTab } from '@/components/orders/finance/order-finance-expenses-tab'
import { UpdateStatusForm } from './_components/update-status-form'
import { ORDER_STATUS_LABELS, ORDER_STATUS_STYLES, ORDER_TYPE_LABELS } from '@/lib/orders/labels'
import { formatCZK } from '@/lib/format'

type ActiveTab = 'overview' | 'income' | 'expenses'

function resolveTab(raw: string | string[] | undefined): ActiveTab {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === 'income' || value === 'expenses') return value
  return 'overview'
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const sp = await searchParams
  const activeTab = resolveTab(sp.tab)

  const order = await getOrderDetail(id)
  if (!order) {
    notFound()
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto p-8">
        <OrderDetailHeader order={order} />
        <OrderDetailTabs orderId={id} activeTab={activeTab} />
        <div>
          {activeTab === 'overview' && <OrderOverviewTab order={order} orderId={id} />}
          {activeTab === 'income' && <OrderFinanceIncomeTab orderId={id} />}
          {activeTab === 'expenses' && <OrderFinanceExpensesTab orderId={id} />}
        </div>
      </div>
    </div>
  )
}

function OrderOverviewTab({ order, orderId }: { order: OrderDetail; orderId: string }) {
  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
        <div>
          <dt className="text-muted-foreground mb-0.5">Číslo objednávky</dt>
          <dd className="font-medium">{order.number}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground mb-0.5">Typ</dt>
          <dd>{ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground mb-0.5">Stav</dt>
          <dd>
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                ORDER_STATUS_STYLES[order.status] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground mb-0.5">Klient</dt>
          <dd>
            {order.clientDisplayName ?? (
              order.clientSubjectId
                ? <span className="font-mono text-xs text-gray-400">{order.clientSubjectId}</span>
                : '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground mb-0.5">Termín</dt>
          <dd>
            {order.dueDate
              ? new Date(order.dueDate + 'T00:00:00').toLocaleDateString('cs-CZ')
              : '—'}
          </dd>
        </div>
        {order.assignedTo && (
          <div>
            <dt className="text-muted-foreground mb-0.5">Přiřazeno</dt>
            <dd className="font-mono text-xs text-gray-400">{order.assignedTo}</dd>
          </div>
        )}
        {order.confirmedAt && (
          <div>
            <dt className="text-muted-foreground mb-0.5">Potvrzeno</dt>
            <dd>{order.confirmedAt.toLocaleString('cs-CZ')}</dd>
          </div>
        )}
        {order.completedAt && (
          <div>
            <dt className="text-muted-foreground mb-0.5">Dokončeno</dt>
            <dd>{order.completedAt.toLocaleString('cs-CZ')}</dd>
          </div>
        )}
        {order.cancelledAt && (
          <div>
            <dt className="text-muted-foreground mb-0.5">Zrušeno</dt>
            <dd>{order.cancelledAt.toLocaleString('cs-CZ')}</dd>
          </div>
        )}
        {order.notes && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground mb-0.5">Poznámky</dt>
            <dd className="whitespace-pre-wrap">{order.notes}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground mb-0.5">Vytvořeno</dt>
          <dd>{order.createdAt.toLocaleString('cs-CZ')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground mb-0.5">Aktualizováno</dt>
          <dd>{order.updatedAt.toLocaleString('cs-CZ')}</dd>
        </div>
      </dl>

      <UpdateStatusForm orderId={orderId} currentStatus={order.status} />

      {order.participants.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Účastníci</h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jméno
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Podíl
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {order.participants.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 text-gray-900">
                      {p.displayName ?? (
                        p.futureSubjectId
                          ? <span className="text-gray-400 italic">Budoucí subjekt</span>
                          : '—'
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{p.roleCode}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {p.sharePercentage ? `${p.sharePercentage} %` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {order.items.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Položky objednávky</h2>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Popis
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Množství
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jedn. cena
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Celkem
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2 text-gray-900">{item.description}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{item.quantity}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{formatCZK(item.unitPrice)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatCZK(item.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
