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
import {
  listPaymentGroups,
  createPaymentAllocation,
  type PaymentGroupListItem,
} from '@/lib/finance/actions'
import { formatCZK } from '@/lib/format'

function buildOptionLabel(pg: PaymentGroupListItem): string {
  const id = `PG-${pg.id.slice(0, 8)}`
  const date = pg.transactionDate
  const counterparty = pg.counterpartyName ?? pg.counterpartyAccountNumber ?? '—'
  const vs = pg.variableSymbol ? `VS: ${pg.variableSymbol}` : 'VS: —'
  const remaining = (
    parseFloat(pg.totalAmount) - parseFloat(pg.allocatedAmount)
  ).toFixed(2)
  return `${id} | ${date} | ${counterparty} | ${vs} | Zbývá: ${formatCZK(remaining)}`
}

export function AddAllocationDialog({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, startTransition] = useTransition()
  const [groups, setGroups] = useState<PaymentGroupListItem[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleOpen() {
    setOpen(true)
    setLoading(true)
    setError(null)
    setSelectedGroupId('')
    setAmount('')
    setNote('')
    try {
      const result = await listPaymentGroups({ limit: 50 })
      if (result.success) {
        const allocatable = result.data.items.filter(
          (pg) =>
            pg.direction === 'INCOME' &&
            (pg.processingStatus === 'NEW' ||
              pg.processingStatus === 'PARTIALLY_ALLOCATED'),
        )
        setGroups(allocatable)
      } else {
        setError(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit() {
    if (!selectedGroupId || !amount) return
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) {
      setError('Zadejte platnou částku větší než 0.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await createPaymentAllocation({
        paymentGroupId: selectedGroupId,
        orderId,
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
      <Button size="sm" onClick={handleOpen}>
        Přidat alokaci
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Přidat alokaci platby</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pg-select">Platební skupina</Label>
              {loading ? (
                <p className="text-sm text-muted-foreground">Načítám skupiny…</p>
              ) : (
                <Select
                  value={selectedGroupId}
                  onValueChange={setSelectedGroupId}
                  disabled={groups.length === 0}
                >
                  <SelectTrigger id="pg-select">
                    <SelectValue
                      placeholder={
                        groups.length === 0
                          ? 'Žádné dostupné skupiny'
                          : 'Vyberte skupinu'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((pg) => (
                      <SelectItem key={pg.id} value={pg.id}>
                        {buildOptionLabel(pg)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
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
            <div className="space-y-1.5">
              <Label htmlFor="alloc-note">Poznámka (volitelné)</Label>
              <Input
                id="alloc-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Poznámka k alokaci"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
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
              disabled={!selectedGroupId || !amount || submitting || loading}
            >
              {submitting ? 'Ukládám…' : 'Uložit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
