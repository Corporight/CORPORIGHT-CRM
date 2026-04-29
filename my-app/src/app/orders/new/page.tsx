import Link from 'next/link'
import { CreateOrderForm } from './_components/create-order-form'

export default function NewOrderPage() {
  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/orders" className="text-sm text-gray-500 hover:text-gray-700">
          ← Objednávky
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-2">Nová objednávka</h1>
      </div>
      <CreateOrderForm />
    </div>
  )
}
