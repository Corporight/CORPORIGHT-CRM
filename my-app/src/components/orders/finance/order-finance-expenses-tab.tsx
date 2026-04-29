import { listFinancialMovements } from '@/lib/finance/actions'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCZK } from '@/lib/format'
import { VAT_MODE_LABELS } from '@/lib/finance/labels'

export async function OrderFinanceExpensesTab({ orderId }: { orderId: string }) {
  const result = await listFinancialMovements({ orderId, direction: 'EXPENSE' })

  if (!result.success) {
    return (
      <p className="text-sm text-destructive">Chyba: {result.error}</p>
    )
  }

  const { items } = result.data

  const totalCents = items.reduce(
    (sum, m) => sum + Math.round(parseFloat(m.amountGross) * 100),
    0,
  )
  const totalFormatted = (totalCents / 100).toFixed(2)

  return (
    <div>
      <h2 className="text-base font-semibold mb-4">Výdaje</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Žádné výdaje k této objednávce.
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Popis</TableHead>
                <TableHead>Hrubá částka</TableHead>
                <TableHead>Režim DPH</TableHead>
                <TableHead>Platební skupina</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="text-sm">{movement.movementDate}</TableCell>
                  <TableCell className="text-sm">{movement.description}</TableCell>
                  <TableCell className="font-medium">
                    {formatCZK(movement.amountGross)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {VAT_MODE_LABELS[movement.vatMode as keyof typeof VAT_MODE_LABELS] ?? movement.vatMode}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {movement.paymentGroupId
                      ? `${movement.paymentGroupId.slice(0, 8)}…`
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-3 flex justify-end border-t pt-3">
            <p className="text-sm text-muted-foreground">
              Celkem výdaje:{' '}
              <span className="font-semibold text-gray-900">{formatCZK(totalFormatted)}</span>
            </p>
          </div>
        </>
      )}
    </div>
  )
}
