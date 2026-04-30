import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  getPaymentGroupDetail,
  type PaymentGroupDetail,
} from '@/lib/finance/actions'
import {
  DIRECTION_LABELS,
  PROCESSING_STATUS_LABELS,
  SOURCE_LABELS,
  VAT_MODE_LABELS,
} from '@/lib/finance/labels'
import { formatCZK } from '@/lib/format'

function directionBadge(direction: string): string {
  if (direction === 'INCOME') return 'bg-green-100 text-green-800'
  if (direction === 'EXPENSE') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-700'
}

function processingStatusBadge(status: string): string {
  if (status === 'FULLY_ALLOCATED') return 'bg-green-100 text-green-800'
  if (status === 'PARTIALLY_ALLOCATED') return 'bg-yellow-100 text-yellow-800'
  if (status === 'CANCELLED') return 'bg-gray-100 text-gray-500'
  return 'bg-blue-100 text-blue-800'
}

export default async function PaymentGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getPaymentGroupDetail(id)

  if (!result.success) {
    notFound()
  }

  const pg = result.data

  const remaining = (
    parseFloat(pg.totalAmount) - parseFloat(pg.allocatedAmount)
  ).toFixed(2)

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link
          href="/finance/payment-groups"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Platební skupiny
        </Link>
      </div>

      <h1 className="text-2xl font-semibold mb-8">
        Platba{' '}
        {new Date(pg.transactionDate + 'T00:00:00').toLocaleDateString('cs-CZ')}
        {' '}—{' '}
        {(DIRECTION_LABELS as Record<string, string>)[pg.direction] ?? pg.direction}
      </h1>

      <div className="space-y-8">
        {/* Header info card */}
        <section className="border border-gray-200 rounded-lg p-6">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Středisko</dt>
              <dd className="font-medium">{pg.centerCode} – {pg.centerName}</dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Směr</dt>
              <dd>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${directionBadge(pg.direction)}`}
                >
                  {(DIRECTION_LABELS as Record<string, string>)[pg.direction] ?? pg.direction}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Zdroj</dt>
              <dd>{(SOURCE_LABELS as Record<string, string>)[pg.source] ?? pg.source}</dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Stav zpracování</dt>
              <dd>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${processingStatusBadge(pg.processingStatus)}`}
                >
                  {(PROCESSING_STATUS_LABELS as Record<string, string>)[pg.processingStatus] ?? pg.processingStatus}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Celková částka</dt>
              <dd className="font-medium">{formatCZK(pg.totalAmount)}</dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Alokováno</dt>
              <dd className="font-medium">{formatCZK(pg.allocatedAmount)}</dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Zbývá</dt>
              <dd className="font-medium">{formatCZK(remaining)}</dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Datum transakce</dt>
              <dd>
                {new Date(pg.transactionDate + 'T00:00:00').toLocaleDateString('cs-CZ')}
              </dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Variabilní symbol</dt>
              <dd>{pg.variableSymbol ?? '—'}</dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Konstantní symbol</dt>
              <dd>{pg.constantSymbol ?? '—'}</dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Specifický symbol</dt>
              <dd>{pg.specificSymbol ?? '—'}</dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Protistrana</dt>
              <dd>{pg.counterpartyName ?? '—'}</dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Číslo účtu</dt>
              <dd>
                {pg.counterpartyAccountNumber
                  ? `${pg.counterpartyAccountNumber}/${pg.counterpartyBankCode ?? '?'}`
                  : '—'}
              </dd>
            </div>

            {pg.note && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground mb-0.5">Poznámka</dt>
                <dd className="whitespace-pre-wrap">{pg.note}</dd>
              </div>
            )}

            {pg.noteInternal && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground mb-0.5">Interní poznámka</dt>
                <dd className="whitespace-pre-wrap">{pg.noteInternal}</dd>
              </div>
            )}

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Vytvořeno</dt>
              <dd>{pg.createdAt.toLocaleString('cs-CZ')}</dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground mb-0.5">Aktualizováno</dt>
              <dd>{pg.updatedAt.toLocaleString('cs-CZ')}</dd>
            </div>
          </dl>
        </section>

        {/* Finanční pohyby */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Finanční pohyby</h2>
          {pg.movements.length === 0 ? (
            <p className="text-sm text-gray-400">Žádné pohyby.</p>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Datum
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Směr
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hrubá částka
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      DPH
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Režim DPH
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Popis
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {pg.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2 text-gray-700">
                        {new Date(m.movementDate + 'T00:00:00').toLocaleDateString('cs-CZ')}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${directionBadge(m.direction)}`}
                        >
                          {(DIRECTION_LABELS as Record<string, string>)[m.direction] ?? m.direction}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900">
                        {formatCZK(m.amountGross)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600">
                        {formatCZK(m.vatAmount)}
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {(VAT_MODE_LABELS as Record<string, string>)[m.vatMode] ?? m.vatMode}
                      </td>
                      <td className="px-4 py-2 text-gray-700">{m.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Alokace */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Alokace</h2>
          {pg.allocations.length === 0 ? (
            <p className="text-sm text-gray-400">Žádné alokace.</p>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Zakázka
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Alokovaná částka
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stav
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Zrušeno
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Poznámka
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {pg.allocations.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-2">
                        <Link
                          href={`/orders/${a.orderId}`}
                          className="font-mono text-xs text-blue-600 hover:underline"
                        >
                          {a.orderId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900">
                        {formatCZK(a.allocatedAmount)}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {a.status === 'ACTIVE' ? 'Aktivní' : 'Zrušeno'}
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {a.cancelledAt
                          ? a.cancelledAt.toLocaleString('cs-CZ')
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-gray-600">{a.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
