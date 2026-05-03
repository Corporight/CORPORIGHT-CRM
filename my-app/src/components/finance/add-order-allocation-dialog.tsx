'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listOrders, type OrderListItem } from '@/lib/orders/actions'
import { createPaymentAllocation } from '@/lib/finance/actions'

type Props = {
  pgId: string
  remaining: string // decimal string e.g. "1250.00" — the unallocated capacity
}

function buildOrderLabel(o: OrderListItem): string {
  return `${o.number} | ${o.clientDisplayName ?? '—'} | Stav: ${o.status}`
}

export function AddOrderAllocationDialog({ pgId, remaining }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, startTransition] = useTransition()
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [filter, setFilter] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleOpen() {
    setOpen(true)
    setLoading(true)
    setError(null)
    setSelectedOrderId('')
    setFilter('')
    setAmount(remaining) // pre-fill amount with remaining capacity
    setNote('')
    try {
      const result = await listOrders({ limit: 50 })
      if (result.success) {
        // exclude CANCELLED orders client-side
        const allocatable = result.data.items.filter(
          (o) => o.status !== 'CANCELLED',
        )
        setOrders(allocatable)
        if (result.data.total > result.data.items.length) {
          setError(`Zobrazeno ${result.data.items.length} z ${result.data.total} zakázek. Pro přesnější výsledky použijte vyhledávání.`)
        }
      } else {
        setError(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  const filteredOrders = filter.trim()
    ? orders.filter(
        (o) =>
          o.number.toLowerCase().includes(filter.toLowerCase()) ||
          (o.clientDisplayName ?? '').toLowerCase().includes(filter.toLowerCase()),
      )
    : orders

  function handleSubmit() {
    if (!selectedOrderId || !amount) return
    const parsed = parseFloat(amount)
    const remainingNum = parseFloat(remaining)
    if (isNaN(remainingNum)) {
      setError('Neplatná zbývající kapacita.')
      return
    }
    if (isNaN(parsed) || parsed <= 0) {
      setError('Zadejte platnou částku větší než 0.')
      return
    }
    if (parsed > remainingNum) {
      setError(`Částka přesahuje zbývající kapacitu (${remaining} CZK).`)
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await createPaymentAllocation({
        paymentGroupId: pgId,
        orderId: selectedOrderId,
        allocatedAmount: parsed.toFixed(2),
        note: note.trim() || undefined,
      })
      if (result.success) {
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <Button
        size="sm"
        onClick={handleOpen}
        className="bg-gray-900 text-white hover:bg-gray-700 border-0 shadow-none transition-colors"
      >
        Alokovat na zakázku
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alokovat platbu na zakázku</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Text filter */}
            <div className="space-y-1.5">
              <Label htmlFor="order-filter">Hledat zakázku</Label>
              <Input
                id="order-filter"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value)
                  setSelectedOrderId('')
                }}
                placeholder="Číslo nebo klient…"
              />
            </div>

            {/* Order select */}
            <div className="space-y-1.5">
              <Label htmlFor="order-select">Zakázka</Label>
              {loading ? (
                <p className="text-sm text-muted-foreground">Načítám zakázky…</p>
              ) : (
                <Select
                  value={selectedOrderId}
                  onValueChange={setSelectedOrderId}
                  disabled={filteredOrders.length === 0}
                >
                  <SelectTrigger id="order-select">
                    <SelectValue
                      placeholder={
                        filteredOrders.length === 0
                          ? 'Žádné dostupné zakázky'
                          : 'Vyberte zakázku'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredOrders.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {buildOrderLabel(o)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label htmlFor="alloc-amount">Částka (CZK)</Label>
              <Input
                id="alloc-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <Label htmlFor="alloc-note">Poznámka (volitelné)</Label>
              <Input
                id="alloc-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Poznámka k alokaci"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Zrušit
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedOrderId || !amount || submitting || loading}
              className="bg-gray-900 text-white border-0 shadow-none hover:bg-gray-700 transition-colors"
            >
              {submitting ? 'Ukládám…' : 'Uložit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
