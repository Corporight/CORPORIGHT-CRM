import { Badge } from '@/components/ui/badge'
import type { OrderDetail } from '@/lib/orders/reads'

export function OrderDetailHeader({ order }: { order: OrderDetail }) {
  return (
    <div className="mb-6 pb-6 border-b">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-2xl font-semibold">{order.number}</h1>
        <Badge variant="outline">{order.status}</Badge>
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>{order.orderType}</span>
        {order.dueDate && <span>Splatnost: {order.dueDate}</span>}
        <span>Vytvořeno: {order.createdAt.toLocaleDateString('cs-CZ')}</span>
      </div>
    </div>
  )
}
