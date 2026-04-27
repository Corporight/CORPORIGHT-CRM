import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCZK } from '@/lib/format'
import type { PaymentAllocationItem } from '@/lib/finance/actions'
import { AddAllocationDialog } from './add-allocation-dialog'
import { CancelAllocationDialog } from './cancel-allocation-dialog'

export function OrderAllocationsTable({
  orderId,
  allocations,
}: {
  orderId: string
  allocations: PaymentAllocationItem[]
}) {
  const active = allocations.filter((a) => a.status === 'ACTIVE')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">Alokace plateb</h2>
        <AddAllocationDialog orderId={orderId} />
      </div>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Žádné aktivní alokace.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vytvořeno</TableHead>
              <TableHead>Částka</TableHead>
              <TableHead>Platební skupina</TableHead>
              <TableHead>Poznámka</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.map((allocation) => (
              <TableRow key={allocation.id}>
                <TableCell className="text-sm">
                  {allocation.createdAt.toLocaleDateString('cs-CZ')}
                </TableCell>
                <TableCell className="font-medium">
                  {formatCZK(allocation.allocatedAmount)}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {allocation.paymentGroupId.slice(0, 8)}…
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {allocation.note ?? '—'}
                </TableCell>
                <TableCell className="text-right">
                  <CancelAllocationDialog
                    allocationId={allocation.id}
                    allocatedAmount={allocation.allocatedAmount}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
