'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCompanySubject } from '@/lib/subjects/actions'

const INPUT =
  'border border-gray-300 rounded-md px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-400'

const SELECT =
  'border border-gray-300 rounded-md px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 pb-1.5 mb-4">
        {title}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

const INITIAL = {
  companyName: '',
  registrationNumber: '',
  vatNumber: '',
  vatPayer: false,
  legalForm: '',
  registrationDate: '',
  registrationCourt: '',
  email: '',
  phone: '',
  tags: '',
  notes: '',
  role: '' as '' | 'CLIENT' | 'SUPPLIER' | 'PARTNER' | 'OTHER',
  addAddress: false,
  addressType: 'REGISTERED' as 'REGISTERED' | 'MAILING' | 'BILLING' | 'OPERATIONAL',
  street: '',
  city: '',
  postal: '',
  country: 'CZ',
}

type F = typeof INITIAL

export function CreateCompanyForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<F>(INITIAL)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof F>(key: K, value: F[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createCompanySubject({
        email: form.email || undefined,
        phone: form.phone || undefined,
        notes: form.notes || undefined,
        tags: form.tags
          ? form.tags.split(',').map(t => t.trim()).filter(Boolean)
          : undefined,
        role: form.role || undefined,
        profile: {
          companyName: form.companyName,
          registrationNumber: form.registrationNumber,
          vatNumber: form.vatNumber || undefined,
          legalForm: form.legalForm || undefined,
          registrationDate: form.registrationDate || undefined,
          registrationCourt: form.registrationCourt || undefined,
        },
        address: form.addAddress
          ? {
              addressType: form.addressType,
              street: form.street,
              city: form.city,
              postal: form.postal,
              country: form.country || 'CZ',
            }
          : undefined,
      })

      if (result.success) {
        router.push('/subjects')
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <Section title="Company details">
        <Field label="Company name" required>
          <input
            className={INPUT}
            value={form.companyName}
            onChange={e => set('companyName', e.target.value)}
            required
            disabled={isPending}
          />
        </Field>
        <Field label="Registration number (IČO)" required>
          <input
            className={INPUT}
            value={form.registrationNumber}
            onChange={e => set('registrationNumber', e.target.value)}
            required
            disabled={isPending}
            placeholder="12345678"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Legal form">
            <input
              className={INPUT}
              value={form.legalForm}
              onChange={e => set('legalForm', e.target.value)}
              disabled={isPending}
              placeholder="s.r.o., a.s., …"
            />
          </Field>
          <Field label="Registration date">
            <input
              type="date"
              className={INPUT}
              value={form.registrationDate}
              onChange={e => set('registrationDate', e.target.value)}
              disabled={isPending}
            />
          </Field>
        </div>
        <Field label="Registration court">
          <input
            className={INPUT}
            value={form.registrationCourt}
            onChange={e => set('registrationCourt', e.target.value)}
            disabled={isPending}
            placeholder="Krajský soud v Praze, oddíl C, vložka …"
          />
        </Field>
      </Section>

      <Section title="VAT">
        <div className="grid grid-cols-2 gap-4">
          <Field label="VAT number (DIČ)">
            <input
              className={INPUT}
              value={form.vatNumber}
              onChange={e => set('vatNumber', e.target.value)}
              disabled={isPending}
              placeholder="CZ12345678"
            />
          </Field>
          <Field label="VAT payer">
            <label className="flex items-center gap-2 cursor-pointer select-none h-[38px]">
              <input
                type="checkbox"
                checked={form.vatPayer}
                onChange={e => set('vatPayer', e.target.checked)}
                disabled={isPending}
                className="rounded border-gray-300 text-gray-900"
              />
              <span className="text-sm text-gray-700">Registered VAT payer</span>
            </label>
          </Field>
        </div>
      </Section>

      <Section title="Contact">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email">
            <input
              type="email"
              className={INPUT}
              value={form.email}
              onChange={e => set('email', e.target.value)}
              disabled={isPending}
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              className={INPUT}
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              disabled={isPending}
            />
          </Field>
        </div>
      </Section>

      <Section title="Role & tags">
        <Field label="Role">
          <select
            className={SELECT}
            value={form.role}
            onChange={e => set('role', e.target.value as F['role'])}
            disabled={isPending}
          >
            <option value="">— none —</option>
            <option value="CLIENT">Client</option>
            <option value="SUPPLIER">Supplier</option>
            <option value="PARTNER">Partner</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Tags">
          <input
            className={INPUT}
            value={form.tags}
            onChange={e => set('tags', e.target.value)}
            disabled={isPending}
            placeholder="client, vip, preferred (comma-separated)"
          />
        </Field>
        <Field label="Notes">
          <textarea
            className={INPUT}
            rows={3}
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            disabled={isPending}
          />
        </Field>
      </Section>

      <Section title="Address">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.addAddress}
            onChange={e => set('addAddress', e.target.checked)}
            disabled={isPending}
            className="rounded border-gray-300 text-gray-900"
          />
          <span className="text-sm text-gray-700">Add an address</span>
        </label>

        {form.addAddress && (
          <div className="space-y-4 pt-2">
            <Field label="Address type" required>
              <select
                className={SELECT}
                value={form.addressType}
                onChange={e => set('addressType', e.target.value as F['addressType'])}
                disabled={isPending}
              >
                <option value="REGISTERED">Registered</option>
                <option value="MAILING">Mailing</option>
                <option value="BILLING">Billing</option>
                <option value="OPERATIONAL">Operational</option>
              </select>
            </Field>
            <Field label="Street" required>
              <input
                className={INPUT}
                value={form.street}
                onChange={e => set('street', e.target.value)}
                required={form.addAddress}
                disabled={isPending}
              />
            </Field>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Field label="City" required>
                  <input
                    className={INPUT}
                    value={form.city}
                    onChange={e => set('city', e.target.value)}
                    required={form.addAddress}
                    disabled={isPending}
                  />
                </Field>
              </div>
              <Field label="Postal code" required>
                <input
                  className={INPUT}
                  value={form.postal}
                  onChange={e => set('postal', e.target.value)}
                  required={form.addAddress}
                  disabled={isPending}
                />
              </Field>
            </div>
            <Field label="Country">
              <input
                className={INPUT}
                value={form.country}
                onChange={e => set('country', e.target.value)}
                disabled={isPending}
                placeholder="CZ"
              />
            </Field>
          </div>
        )}
      </Section>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="bg-gray-900 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Creating…' : 'Create company'}
        </button>
        <a
          href="/subjects"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </a>
      </div>
    </form>
  )
}
