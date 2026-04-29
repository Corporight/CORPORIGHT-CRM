import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCZK } from '@/lib/format'
import type { OrderEconomics } from '@/lib/finance/actions'
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES } from '@/lib/orders/labels'

export function OrderFinanceSummaryCard({ economics }: { economics: OrderEconomics }) {
  const orderTotalCents = Math.round(parseFloat(economics.orderTotal) * 100)
  const allocatedCents = Math.round(parseFloat(economics.allocatedPayments) * 100)
  const remainingCents = orderTotalCents - allocatedCents
  const isOverpaid = remainingCents < 0
  const remainingAmount = (Math.abs(remainingCents) / 100).toFixed(2)

  const profitCents = Math.round(parseFloat(economics.actualProfit) * 100)
  const isNegativeProfit = profitCents < 0

  const statusLabel = PAYMENT_STATUS_LABELS[economics.paymentStatus] ?? economics.paymentStatus
  const statusStyle = PAYMENT_STATUS_STYLES[economics.paymentStatus] ?? 'bg-gray-100 text-gray-600'

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Ekonomika objednávky</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground mb-1">Cena objednávky</dt>
            <dd className="font-semibold">{formatCZK(economics.orderTotal)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-1">Přijato</dt>
            <dd className="font-semibold">{formatCZK(economics.allocatedPayments)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-1">
              {isOverpaid ? 'Přeplatek' : 'Zbývá uhradit'}
            </dt>
            <dd className={['font-semibold', isOverpaid ? 'text-orange-600' : ''].join(' ')}>
              {formatCZK(remainingAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground mb-1">Stav platby</dt>
            <dd>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusStyle}`}>
                {statusLabel}
              </span>
            </dd>
          </div>
        </dl>

        <div className="border-t mt-4 pt-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground mb-1">Evidované výdaje</dt>
              <dd className="font-semibold">{formatCZK(economics.expenseTotal)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground mb-1">Aktuální výsledek</dt>
              <dd
                className={[
                  'font-semibold',
                  isNegativeProfit
                    ? 'text-red-600'
                    : profitCents > 0
                      ? 'text-green-700'
                      : '',
                ].join(' ')}
              >
                {formatCZK(economics.actualProfit)}
              </dd>
            </div>
          </dl>
        </div>
      </CardContent>
    </Card>
  )
}
