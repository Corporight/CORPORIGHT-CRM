'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addAddress,
  updateAddress,
  deactivateAddress,
  setAddressPrimary,
} from '@/lib/subjects/actions'

type SubjectAddress = {
  id: string
  addressType: string
  street: string
  city: string
  postal: string
  country: string | null
  isPrimary: boolean
  isActive: boolean
}

const ADDRESS_TYPE_LABELS: Record<string, string> = {
  REGISTERED: 'Registered',
  MAILING: 'Mailing',
  BILLING: 'Billing',
  OPERATIONAL: 'Operational',
}

const INPUT =
  'border border-gray-300 rounded-md px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-400'

const SELECT =
  'border border-gray-300 rounded-md px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50'

type InlineEditState = {
  street: string
  city: string
  postal: string
  country: string
}

function emptyInlineEdit(addr?: SubjectAddress): InlineEditState {
  return {
    street: addr?.street ?? '',
    city: addr?.city ?? '',
    postal: addr?.postal ?? '',
    country: addr?.country ?? 'CZ',
  }
}

type AddFormState = {
  addressType: 'REGISTERED' | 'MAILING' | 'BILLING' | 'OPERATIONAL'
  street: string
  city: string
  postal: string
  country: string
  isPrimary: boolean
}

const EMPTY_ADD: AddFormState = {
  addressType: 'REGISTERED',
  street: '',
  city: '',
  postal: '',
  country: 'CZ',
  isPrimary: false,
}

export function AddressManager({
  subjectId,
  addresses,
}: {
  subjectId: string
  addresses: SubjectAddress[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<InlineEditState>(emptyInlineEdit())
  const [isAdding, setIsAdding] = useState(false)
  const [addForm, setAddForm] = useState<AddFormState>(EMPTY_ADD)
  const [error, setError] = useState<string | null>(null)

  function startEdit(addr: SubjectAddress) {
    setEditingId(addr.id)
    setEditState(emptyInlineEdit(addr))
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setError(null)
  }

  function handleSaveEdit(addressId: string) {
    setError(null)
    startTransition(async () => {
      const result = await updateAddress(addressId, {
        street: editState.street || undefined,
        city: editState.city || undefined,
        postal: editState.postal || undefined,
        country: editState.country || undefined,
      })
      if (result.success) {
        setEditingId(null)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function handleSetPrimary(addressId: string) {
    setError(null)
    startTransition(async () => {
      const result = await setAddressPrimary(addressId)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function handleDeactivate(addressId: string) {
    if (!window.confirm('Remove this address?')) return
    setError(null)
    startTransition(async () => {
      const result = await deactivateAddress(addressId)
      if (result.success) {
        if (editingId === addressId) setEditingId(null)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function handleAdd() {
    setError(null)
    startTransition(async () => {
      const result = await addAddress(subjectId, addForm)
      if (result.success) {
        setIsAdding(false)
        setAddForm(EMPTY_ADD)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 pb-1.5 mb-4">
        Addresses
      </div>

      <div className="space-y-3 mb-4">
        {addresses.map(addr => (
          <div key={addr.id} className="border border-gray-200 rounded-lg px-4 py-3 text-sm">
            {editingId === addr.id ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {ADDRESS_TYPE_LABELS[addr.addressType] ?? addr.addressType}
                  </span>
                  {addr.isPrimary && (
                    <span className="text-xs bg-gray-900 text-white px-1.5 py-0.5 rounded">
                      primary
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Street</label>
                  <input
                    className={INPUT}
                    value={editState.street}
                    onChange={e => setEditState(s => ({ ...s, street: e.target.value }))}
                    disabled={isPending}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                    <input
                      className={INPUT}
                      value={editState.city}
                      onChange={e => setEditState(s => ({ ...s, city: e.target.value }))}
                      disabled={isPending}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Postal</label>
                    <input
                      className={INPUT}
                      value={editState.postal}
                      onChange={e => setEditState(s => ({ ...s, postal: e.target.value }))}
                      disabled={isPending}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
                  <input
                    className={INPUT}
                    value={editState.country}
                    onChange={e => setEditState(s => ({ ...s, country: e.target.value }))}
                    disabled={isPending}
                    placeholder="CZ"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(addr.id)}
                    disabled={isPending}
                    className="border border-gray-300 rounded-md px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={isPending}
                    className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {ADDRESS_TYPE_LABELS[addr.addressType] ?? addr.addressType}
                    </span>
                    {addr.isPrimary && (
                      <span className="text-xs bg-gray-900 text-white px-1.5 py-0.5 rounded">
                        primary
                      </span>
                    )}
                  </div>
                  <div className="text-gray-900">{addr.street}</div>
                  <div className="text-gray-600">
                    {addr.postal} {addr.city}
                    {addr.country && addr.country !== 'CZ' && `, ${addr.country}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  {!addr.isPrimary && (
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(addr.id)}
                      disabled={isPending}
                      className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      Set primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startEdit(addr)}
                    disabled={isPending}
                    className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeactivate(addr.id)}
                    disabled={isPending}
                    className="text-red-400 hover:text-red-600 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {isAdding ? (
        <div className="border border-gray-200 rounded-lg px-4 py-4 space-y-3">
          <div className="text-xs font-medium text-gray-600 mb-1">New address</div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Address type</label>
            <select
              className={SELECT}
              value={addForm.addressType}
              onChange={e =>
                setAddForm(f => ({
                  ...f,
                  addressType: e.target.value as AddFormState['addressType'],
                }))
              }
              disabled={isPending}
            >
              <option value="REGISTERED">Registered</option>
              <option value="MAILING">Mailing</option>
              <option value="BILLING">Billing</option>
              <option value="OPERATIONAL">Operational</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Street *</label>
            <input
              className={INPUT}
              value={addForm.street}
              onChange={e => setAddForm(f => ({ ...f, street: e.target.value }))}
              disabled={isPending}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">City *</label>
              <input
                className={INPUT}
                value={addForm.city}
                onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))}
                disabled={isPending}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Postal *</label>
              <input
                className={INPUT}
                value={addForm.postal}
                onChange={e => setAddForm(f => ({ ...f, postal: e.target.value }))}
                disabled={isPending}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
            <input
              className={INPUT}
              value={addForm.country}
              onChange={e => setAddForm(f => ({ ...f, country: e.target.value }))}
              disabled={isPending}
              placeholder="CZ"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
            <input
              type="checkbox"
              checked={addForm.isPrimary}
              onChange={e => setAddForm(f => ({ ...f, isPrimary: e.target.checked }))}
              disabled={isPending}
              className="rounded border-gray-300 text-gray-900"
            />
            Set as primary
          </label>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleAdd}
              disabled={isPending || !addForm.street || !addForm.city || !addForm.postal}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Saving…' : 'Add address'}
            </button>
            <button
              type="button"
              onClick={() => { setIsAdding(false); setAddForm(EMPTY_ADD); setError(null) }}
              disabled={isPending}
              className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setIsAdding(true); setError(null) }}
          disabled={isPending}
          className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
        >
          + Add address
        </button>
      )}

      {error && (
        <p className="text-sm text-red-600 mt-2">{error}</p>
      )}
    </section>
  )
}
