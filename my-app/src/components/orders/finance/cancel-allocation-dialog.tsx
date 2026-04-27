'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cancelPaymentAllocation } from '@/lib/finance/actions'
import { formatCZK } from '@/lib/format'

export function CancelAllocationDialog({
  allocationId,
  allocatedAmount,
}: {
  allocationId: string
  allocatedAmount: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, startTransition] = useTransition()

  function handleOpen() {
    setOpen(true)
    setReason('')
    setError(null)
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await cancelPaymentAllocation({
        paymentAllocationId: allocationId,
        cancelledReason: reason.trim() || undefined,
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
      <Button variant="destructive" size="sm" onClick={handleOpen}>
        Zrušit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Zrušit alokaci</DialogTitle>
            <DialogDescription>
              Chystáte se zrušit alokaci ve výši{' '}
              <strong>{formatCZK(allocatedAmount)}</strong>.
              Tuto akci nelze vrátit zpět.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="cancel-reason">Důvod zrušení (volitelné)</Label>
            <Input
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Důvod…"
            />
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
              Zpět
            </Button>
            <Button
              variant="destructive"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Ruším…' : 'Zrušit alokaci'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
