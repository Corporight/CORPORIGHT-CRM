import type { OrderDetail } from '@/lib/orders/reads'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLES,
  ORDER_TYPE_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
} from '@/lib/orders/labels'

export function OrderDetailHeader({ order }: { order: OrderDetail }) {
  const statusLabel = ORDER_STATUS_LABELS[order.status] ?? order.status
  const statusStyle = ORDER_STATUS_STYLES[order.status] ?? 'bg-gray-100 text-gray-600'
  const typeLabel = ORDER_TYPE_LABELS[order.orderType] ?? order.orderType
  const paymentLabel = PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus
  const paymentStyle = PAYMENT_STATUS_STYLES[order.paymentStatus] ?? 'bg-gray-100 text-gray-600'

  return (
    <div className="mb-6 pb-6 border-b">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-semibold">{order.number}</h1>
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusStyle}`}>
          {statusLabel}
        </span>
        <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${paymentStyle}`}>
          {paymentLabel}
        </span>
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>{typeLabel}</span>
        {order.clientDisplayName && <span>Klient: {order.clientDisplayName}</span>}
        {order.dueDate && (
          <span>Termín: {new Date(order.dueDate + 'T00:00:00').toLocaleDateString('cs-CZ')}</span>
        )}
        <span>Vytvořeno: {order.createdAt.toLocaleDateString('cs-CZ')}</span>
      </div>
    </div>
  )
}
