import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  getPaymentGroupDetail,
  listFinancialTreeCategories,
  listFinancialTreeTypes,
  listFinancialTreeDetails,
  type FinancialTreeCategoryListItem,
  type FinancialTreeTypeListItem,
  type FinancialTreeDetailListItem,
} from '@/lib/finance/actions'
import { listOrders, type OrderListItem } from '@/lib/orders/actions'
import { CreateMovementForm } from './_components/create-movement-form'

export default async function NewMovementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const pgResult = await getPaymentGroupDetail(id)
  if (!pgResult.success) {
    notFound()
  }
  const pg = pgResult.data

  const [categoriesResult, typesResult, detailsResult, ordersResult] = await Promise.all([
    listFinancialTreeCategories({ activeOnly: true, direction: pg.direction }),
    listFinancialTreeTypes({ activeOnly: true }),
    listFinancialTreeDetails({ activeOnly: true }),
    listOrders({ limit: 50 }),
  ])

  const categories: FinancialTreeCategoryListItem[] = categoriesResult.success
    ? categoriesResult.data.items
    : []
  const types: FinancialTreeTypeListItem[] = typesResult.success
    ? typesResult.data.items
    : []
  const details: FinancialTreeDetailListItem[] = detailsResult.success
    ? detailsResult.data.items
    : []
  const ordersRaw = ordersResult.success ? ordersResult.data.items : []
  const ordersTotal = ordersResult.success ? ordersResult.data.total : 0
  const orders: OrderListItem[] = ordersRaw.filter((o) => o.status !== 'CANCELLED')
  const ordersTruncated = ordersTotal > ordersRaw.length

  const defaultMovementDate = new Date().toISOString().split('T')[0]

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/finance/payment-groups/${id}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Platební skupina
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">
          Nový finanční pohyb
        </h1>
      </div>
      <CreateMovementForm
        pgId={pg.id}
        centerId={pg.centerId}
        centerCode={pg.centerCode}
        centerName={pg.centerName}
        direction={pg.direction as 'INCOME' | 'EXPENSE' | 'INTERNAL'}
        categories={categories}
        types={types}
        details={details}
        defaultMovementDate={defaultMovementDate}
        orders={orders}
        ordersTruncated={ordersTruncated}
      />
    </div>
  )
}
