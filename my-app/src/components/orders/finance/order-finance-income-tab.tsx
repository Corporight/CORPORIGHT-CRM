import { getOrderEconomics, listAllocationsForOrder } from '@/lib/finance/actions'
import { OrderFinanceSummaryCard } from './order-finance-summary-card'
import { OrderAllocationsTable } from './order-allocations-table'

export async function OrderFinanceIncomeTab({ orderId }: { orderId: string }) {
  const [economicsResult, allocationsResult] = await Promise.all([
    getOrderEconomics(orderId),
    listAllocationsForOrder(orderId),
  ])

  return (
    <div>
      {economicsResult.success ? (
        <OrderFinanceSummaryCard economics={economicsResult.data} />
      ) : (
        <p className="text-sm text-destructive mb-4">
          Chyba načítání ekonomiky: {economicsResult.error}
        </p>
      )}
      {allocationsResult.success ? (
        <OrderAllocationsTable
          orderId={orderId}
          allocations={allocationsResult.data.items}
        />
      ) : (
        <p className="text-sm text-destructive">
          Chyba načítání alokací: {allocationsResult.error}
        </p>
      )}
    </div>
  )
}
