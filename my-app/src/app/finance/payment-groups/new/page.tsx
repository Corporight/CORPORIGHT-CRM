import Link from 'next/link'
import { listCenters } from '@/lib/finance/actions'
import { CreatePaymentGroupForm } from './_components/create-payment-group-form'

export default async function NewPaymentGroupPage() {
  const centersResult = await listCenters()
  const centers = centersResult.success ? centersResult.data.items : []

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/finance/payment-groups" className="text-sm text-gray-500 hover:text-gray-700">
          ← Platební skupiny
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">Nová platební skupina</h1>
      </div>
      <CreatePaymentGroupForm centers={centers} />
    </div>
  )
}
