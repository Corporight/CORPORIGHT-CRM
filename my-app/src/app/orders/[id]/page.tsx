import { notFound } from 'next/navigation'
import { getOrderDetail, type OrderDetail } from '@/lib/orders/reads'
import { OrderDetailHeader } from '@/components/orders/order-detail-header'
import { OrderDetailTabs } from '@/components/orders/order-detail-tabs'
import { OrderFinanceIncomeTab } from '@/components/orders/finance/order-finance-income-tab'
import { OrderFinanceExpensesTab } from '@/components/orders/finance/order-finance-expenses-tab'

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
          {activeTab === 'overview' && <OrderOverviewTab order={order} />}
          {activeTab === 'income' && <OrderFinanceIncomeTab orderId={id} />}
          {activeTab === 'expenses' && <OrderFinanceExpensesTab orderId={id} />}
        </div>
      </div>
    </div>
  )
}

function OrderOverviewTab({ order }: { order: OrderDetail }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
      <div>
        <dt className="text-muted-foreground mb-0.5">Číslo zakázky</dt>
        <dd className="font-medium">{order.number}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground mb-0.5">Typ</dt>
        <dd>{order.orderType}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground mb-0.5">Stav</dt>
        <dd>{order.status}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground mb-0.5">Klient (ID)</dt>
        <dd className="font-mono text-xs break-all">{order.clientSubjectId ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground mb-0.5">Přiřazeno (ID)</dt>
        <dd className="font-mono text-xs break-all">{order.assignedTo ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground mb-0.5">Splatnost</dt>
        <dd>{order.dueDate ?? '—'}</dd>
      </div>
      {order.notes && (
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground mb-0.5">Poznámky</dt>
          <dd className="whitespace-pre-wrap">{order.notes}</dd>
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
      <div>
        <dt className="text-muted-foreground mb-0.5">Vytvořeno</dt>
        <dd>{order.createdAt.toLocaleString('cs-CZ')}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground mb-0.5">Aktualizováno</dt>
        <dd>{order.updatedAt.toLocaleString('cs-CZ')}</dd>
      </div>
    </dl>
  )
}
