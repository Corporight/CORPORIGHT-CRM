import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCZK } from '@/lib/format'
import type { OrderEconomics } from '@/lib/finance/actions'

export function OrderFinanceSummaryCard({ economics }: { economics: OrderEconomics }) {
  const orderTotalCents = Math.round(parseFloat(economics.orderTotal) * 100)
  const allocatedCents = Math.round(parseFloat(economics.allocatedPayments) * 100)
  const remainingCents = orderTotalCents - allocatedCents
  const isOverpaid = remainingCents < 0
  const remainingAmount = (Math.abs(remainingCents) / 100).toFixed(2)

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Přehled plateb</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground mb-1">Celková cena</dt>
            <dd className="font-semibold">{formatCZK(economics.orderTotal)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-1">Přijato</dt>
            <dd className="font-semibold">{formatCZK(economics.allocatedPayments)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-1">
              {isOverpaid ? 'Přeplatek' : 'Zbývá'}
            </dt>
            <dd className={['font-semibold', isOverpaid ? 'text-orange-600' : ''].join(' ')}>
              {formatCZK(remainingAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-1">Stav platby</dt>
            <dd>
              <Badge variant="outline">{economics.paymentStatus}</Badge>
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
