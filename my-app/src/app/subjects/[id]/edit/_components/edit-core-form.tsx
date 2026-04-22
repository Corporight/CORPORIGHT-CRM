'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateSubjectCore,
  updatePersonProfile,
  updateCompanyProfile,
  type SubjectDetail,
} from '@/lib/subjects/actions'

const INPUT =
  'border border-gray-300 rounded-md px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-400'

const SELECT =
  'border border-gray-300 rounded-md px-3 py-2 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
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

function SectionHeading({ title }: { title: string }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 pb-1.5 mb-4">
      {title}
    </div>
  )
}

export function EditCoreForm({ detail }: { detail: SubjectDetail }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const { subject } = detail

  // Person state
  const [titleBefore, setTitleBefore] = useState(
    detail.type === 'PERSON' ? (detail.profile.titleBefore ?? '') : '',
  )
  const [firstName, setFirstName] = useState(
    detail.type === 'PERSON' ? detail.profile.firstName : '',
  )
  const [lastName, setLastName] = useState(
    detail.type === 'PERSON' ? detail.profile.lastName : '',
  )
  const [titleAfter, setTitleAfter] = useState(
    detail.type === 'PERSON' ? (detail.profile.titleAfter ?? '') : '',
  )
  const [birthDate, setBirthDate] = useState(
    detail.type === 'PERSON' ? (detail.profile.birthDate ?? '') : '',
  )
  const [nationality, setNationality] = useState(
    detail.type === 'PERSON' ? (detail.profile.nationality ?? '') : '',
  )

  // Company state
  const [companyName, setCompanyName] = useState(
    detail.type === 'COMPANY' ? detail.profile.companyName : '',
  )
  const [registrationNumber, setRegistrationNumber] = useState(
    detail.type === 'COMPANY' ? detail.profile.registrationNumber : '',
  )
  const [legalForm, setLegalForm] = useState(
    detail.type === 'COMPANY' ? (detail.profile.legalForm ?? '') : '',
  )
  const [registrationDate, setRegistrationDate] = useState(
    detail.type === 'COMPANY' ? (detail.profile.registrationDate ?? '') : '',
  )
  const [registrationCourt, setRegistrationCourt] = useState(
    detail.type === 'COMPANY' ? (detail.profile.registrationCourt ?? '') : '',
  )
  const [vatNumber, setVatNumber] = useState(
    detail.type === 'COMPANY' ? (detail.profile.vatNumber ?? '') : '',
  )
  const [vatPayer, setVatPayer] = useState(
    detail.type === 'COMPANY' ? detail.profile.vatPayer : false,
  )

  // Shared core state
  const [email, setEmail] = useState(subject.email ?? '')
  const [phone, setPhone] = useState(subject.phone ?? '')
  const [tags, setTags] = useState((subject.tags ?? []).join(', '))
  const [notes, setNotes] = useState(subject.notes ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    startTransition(async () => {
      let profileResult

      if (detail.type === 'PERSON') {
        profileResult = await updatePersonProfile(subject.id, {
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          titleBefore: titleBefore || undefined,
          titleAfter: titleAfter || undefined,
          birthDate: birthDate || undefined,
          nationality: nationality || undefined,
        })
      } else {
        profileResult = await updateCompanyProfile(subject.id, {
          companyName: companyName || undefined,
          registrationNumber: registrationNumber || undefined,
          legalForm: legalForm || undefined,
          registrationDate: registrationDate || undefined,
          registrationCourt: registrationCourt || undefined,
          vatNumber: vatNumber || undefined,
          vatPayer,
        })
      }

      if (!profileResult.success) {
        setError(profileResult.error)
        return
      }

      const coreResult = await updateSubjectCore(subject.id, {
        email: email || undefined,
        phone: phone || undefined,
        notes: notes || undefined,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      })

      if (!coreResult.success) {
        setError(coreResult.error)
        return
      }

      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {detail.type === 'PERSON' && (
        <section>
          <SectionHeading title="Identity" />
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <Field label="Title before">
                <input
                  className={INPUT}
                  value={titleBefore}
                  onChange={e => setTitleBefore(e.target.value)}
                  disabled={isPending}
                  placeholder="Ing., Mgr., …"
                />
              </Field>
              <div className="col-span-1">
                <Field label="First name" required>
                  <input
                    className={INPUT}
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                    disabled={isPending}
                  />
                </Field>
              </div>
              <div className="col-span-1">
                <Field label="Last name" required>
                  <input
                    className={INPUT}
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                    disabled={isPending}
                  />
                </Field>
              </div>
              <Field label="Title after">
                <input
                  className={INPUT}
                  value={titleAfter}
                  onChange={e => setTitleAfter(e.target.value)}
                  disabled={isPending}
                  placeholder="Ph.D., …"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Birth date">
                <input
                  type="date"
                  className={INPUT}
                  value={birthDate}
                  onChange={e => setBirthDate(e.target.value)}
                  disabled={isPending}
                />
              </Field>
              <Field label="Nationality">
                <input
                  className={INPUT}
                  value={nationality}
                  onChange={e => setNationality(e.target.value)}
                  disabled={isPending}
                  placeholder="CZ"
                />
              </Field>
            </div>
          </div>
        </section>
      )}

      {detail.type === 'COMPANY' && (
        <section>
          <SectionHeading title="Company details" />
          <div className="space-y-4">
            <Field label="Company name" required>
              <input
                className={INPUT}
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                required
                disabled={isPending}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Registration number (IČO)" required>
                <input
                  className={INPUT}
                  value={registrationNumber}
                  onChange={e => setRegistrationNumber(e.target.value)}
                  required
                  disabled={isPending}
                />
              </Field>
              <Field label="Legal form">
                <input
                  className={INPUT}
                  value={legalForm}
                  onChange={e => setLegalForm(e.target.value)}
                  disabled={isPending}
                  placeholder="s.r.o., a.s., …"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Registration date">
                <input
                  type="date"
                  className={INPUT}
                  value={registrationDate}
                  onChange={e => setRegistrationDate(e.target.value)}
                  disabled={isPending}
                />
              </Field>
              <Field label="VAT number (DIČ)">
                <input
                  className={INPUT}
                  value={vatNumber}
                  onChange={e => setVatNumber(e.target.value)}
                  disabled={isPending}
                  placeholder="CZ12345678"
                />
              </Field>
            </div>
            <Field label="Registration court">
              <input
                className={INPUT}
                value={registrationCourt}
                onChange={e => setRegistrationCourt(e.target.value)}
                disabled={isPending}
                placeholder="Krajský soud v Praze, oddíl C, vložka …"
              />
            </Field>
            <Field label="VAT payer">
              <label className="flex items-center gap-2 cursor-pointer select-none h-[38px]">
                <input
                  type="checkbox"
                  checked={vatPayer}
                  onChange={e => setVatPayer(e.target.checked)}
                  disabled={isPending}
                  className="rounded border-gray-300 text-gray-900"
                />
                <span className="text-sm text-gray-700">Registered VAT payer</span>
              </label>
            </Field>
          </div>
        </section>
      )}

      <section>
        <SectionHeading title="Contact" />
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email">
              <input
                type="email"
                className={INPUT}
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={isPending}
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                className={INPUT}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                disabled={isPending}
              />
            </Field>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading title="Tags & notes" />
        <div className="space-y-4">
          <Field label="Tags">
            <input
              className={INPUT}
              value={tags}
              onChange={e => setTags(e.target.value)}
              disabled={isPending}
              placeholder="client, vip, preferred (comma-separated)"
            />
          </Field>
          <Field label="Internal note">
            <textarea
              className={INPUT}
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={isPending}
            />
          </Field>
        </div>
      </section>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="bg-gray-900 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
        {saved && (
          <span className="text-sm text-green-600">Saved ✓</span>
        )}
      </div>
    </form>
  )
}
