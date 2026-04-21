import { listOrders } from '@/lib/orders/actions'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export default async function OrdersPage() {
  const result = await listOrders()

  if (!result.success) {
    return (
      <div className="p-8">
        <p className="text-sm text-destructive">Chyba: {result.error}</p>
      </div>
    )
  }

  const { items } = result.data

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Zakázky</h1>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Žádné zakázky</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Číslo</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Stav</TableHead>
              <TableHead>Splatnost</TableHead>
              <TableHead>Vytvořeno</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <Link
                    href={`/orders/${order.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {order.number}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{order.orderType}</TableCell>
                <TableCell>
                  <Badge variant="outline">{order.status}</Badge>
                </TableCell>
                <TableCell className="text-sm">{order.dueDate ?? '—'}</TableCell>
                <TableCell className="text-sm">
                  {order.createdAt.toLocaleDateString('cs-CZ')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
