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

export async function OrderFinanceExpensesTab({ orderId }: { orderId: string }) {
  const result = await listFinancialMovements({ orderId, direction: 'EXPENSE' })

  if (!result.success) {
    return (
      <p className="text-sm text-destructive">Chyba: {result.error}</p>
    )
  }

  const { items } = result.data

  return (
    <div>
      <h2 className="text-base font-semibold mb-4">Výdaje</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Žádné výdaje k této objednávce.
        </p>
      ) : (
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
                  {movement.vatMode}
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
      )}
    </div>
  )
}
