import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getRelationDetail, type RelationEventSummary } from '@/lib/relations/actions'
import { TerminateForm } from './_components/terminate-form'
import { ReactivateForm } from './_components/reactivate-form'
import { UpdateRelationForm } from './_components/update-relation-form'

type Params = Promise<{ id: string }>

// ── Helpers ────────────────────────────────────────────────────────

function fmtDate(value: Date | null | undefined): string {
  if (!value) return '—'
  return value.toLocaleDateString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function fmtDateStr(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function toDateInputValue(value: Date | null | undefined): string | null {
  if (!value) return null
  return value.toISOString().slice(0, 10)
}

const RELATION_TYPE_LABELS: Record<string, string> = {
  SHAREHOLDER: 'Shareholder',
  DIRECTOR: 'Director',
  PROCURIST: 'Procurist',
  BENEFICIAL_OWNER: 'Beneficial owner',
  REPRESENTATIVE: 'Representative',
}

const EVENT_TYPE_STYLES: Record<string, string> = {
  CREATED: 'bg-green-50 text-green-700',
  UPDATED: 'bg-blue-50 text-blue-700',
  TERMINATED: 'bg-red-50 text-red-700',
  REACTIVATED: 'bg-amber-50 text-amber-700',
}

// ── Layout primitives ──────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 pb-1.5 mb-4">
        {title}
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5">
      <dt className="text-sm text-gray-500 shrink-0">{label}</dt>
      <dd className="col-span-2 text-sm text-gray-900">{children}</dd>
    </div>
  )
}

// ── Event snapshot rendering ───────────────────────────────────────

function EventSnapshot({ event }: { event: RelationEventSummary }) {
  const s = event.snapshot as Record<string, unknown> | null

  if (!s || typeof s !== 'object') {
    return <p className="text-xs text-gray-400 italic">Additional event data available.</p>
  }

  if (event.eventType === 'CREATED') {
    return (
      <ul className="text-xs text-gray-600 space-y-0.5">
        {s.validFrom != null && (
          <li>Valid from: {fmtDateStr(s.validFrom as string)}</li>
        )}
        {s.sharePercentage != null && (
          <li>Share: {String(s.sharePercentage)}%</li>
        )}
        {s.noteInternal != null && s.noteInternal !== '' && (
          <li>Note: {String(s.noteInternal)}</li>
        )}
      </ul>
    )
  }

  if (event.eventType === 'TERMINATED') {
    return (
      <ul className="text-xs text-gray-600 space-y-0.5">
        {s.terminatedAt != null && (
          <li>Terminated: {fmtDateStr(s.terminatedAt as string)}</li>
        )}
        {s.reason != null && s.reason !== '' && (
          <li>Reason: {String(s.reason)}</li>
        )}
      </ul>
    )
  }

  if (event.eventType === 'UPDATED') {
    const before = s.before as Record<string, unknown> | undefined
    const after = s.after as Record<string, unknown> | undefined
    const shareChanged = before?.sharePercentage !== after?.sharePercentage
    const noteChanged = before?.noteInternal !== after?.noteInternal

    return (
      <ul className="text-xs text-gray-600 space-y-0.5">
        {s.reason != null && s.reason !== '' && (
          <li>Reason: {String(s.reason)}</li>
        )}
        {shareChanged && before && after && (
          <li>
            Share:{' '}
            {before.sharePercentage != null ? `${before.sharePercentage}%` : '—'}
            {' → '}
            {after.sharePercentage != null ? `${after.sharePercentage}%` : '—'}
          </li>
        )}
        {noteChanged && before && after && (
          <li>
            Note:{' '}
            {before.noteInternal != null && before.noteInternal !== ''
              ? String(before.noteInternal)
              : '(none)'}
            {' → '}
            {after.noteInternal != null && after.noteInternal !== ''
              ? String(after.noteInternal)
              : '(none)'}
          </li>
        )}
      </ul>
    )
  }

  if (event.eventType === 'REACTIVATED') {
    return (
      <ul className="text-xs text-gray-600 space-y-0.5">
        {s.reason != null && s.reason !== '' && (
          <li>Reason: {String(s.reason)}</li>
        )}
        {s.previousValidTo != null && (
          <li>Previously ended: {fmtDateStr(s.previousValidTo as string)}</li>
        )}
      </ul>
    )
  }

  return <p className="text-xs text-gray-400 italic">Additional event data available.</p>
}

// ── Page ───────────────────────────────────────────────────────────

export default async function RelationDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const result = await getRelationDetail({ relationId: id })

  if (!result.success) notFound()

  const rel = result.data
  const validFromStr = toDateInputValue(rel.validFrom)

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/relations"
          className="text-sm text-gray-500 hover:text-gray-700 mb-3 inline-block"
        >
          ← Relations
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-gray-900">
            {RELATION_TYPE_LABELS[rel.relationType] ?? rel.relationType}
          </h1>
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
              rel.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {rel.isActive ? 'Active' : 'Historical'}
          </span>
        </div>
      </div>

      <div className="space-y-8">
        {/* Details */}
        <Section title="Details">
          <dl className="divide-y divide-gray-50">
            <Row label="Type">
              {RELATION_TYPE_LABELS[rel.relationType] ?? rel.relationType}
            </Row>
            <Row label="Subject A">
              <Link
                href={`/subjects/${rel.subjectAId}`}
                className="text-gray-900 hover:text-blue-600"
              >
                {rel.subjectAName}
              </Link>
            </Row>
            <Row label="Subject B">
              <Link
                href={`/subjects/${rel.subjectBId}`}
                className="text-gray-900 hover:text-blue-600"
              >
                {rel.subjectBName}
              </Link>
            </Row>
            <Row label="Share %">
              {rel.sharePercentage != null ? `${rel.sharePercentage}%` : null}
            </Row>
            <Row label="Valid from">{fmtDate(rel.validFrom)}</Row>
            <Row label="Valid to">
              {rel.validTo ? fmtDate(rel.validTo) : null}
            </Row>
            <Row label="Internal note">
              {rel.noteInternal ? (
                <span className="whitespace-pre-wrap">{rel.noteInternal}</span>
              ) : null}
            </Row>
          </dl>
        </Section>

        {/* Actions */}
        <Section title="Actions">
          {rel.isActive ? (
            <div className="flex flex-wrap gap-3">
              <UpdateRelationForm
                relationId={rel.id}
                currentSharePercentage={rel.sharePercentage}
                currentNoteInternal={rel.noteInternal}
              />
              <TerminateForm relationId={rel.id} validFrom={validFromStr} />
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500 mb-3">
                This relation is historical. Reactivate it to make it active again.
              </p>
              <ReactivateForm relationId={rel.id} />
            </div>
          )}
        </Section>

        {/* Event history */}
        <Section title="Event history">
          {rel.events.length === 0 ? (
            <p className="text-sm text-gray-400">No events recorded.</p>
          ) : (
            <ol className="space-y-3">
              {rel.events.map((event) => (
                <li
                  key={event.id}
                  className="border border-gray-200 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        EVENT_TYPE_STYLES[event.eventType] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {event.eventType}
                    </span>
                    <span className="text-xs text-gray-400">{fmtDate(event.createdAt)}</span>
                    {event.createdBy && (
                      <span className="text-xs text-gray-400">by {event.createdBy}</span>
                    )}
                    {event.triggeredByOrderId && (
                      <Link
                        href={`/orders/${event.triggeredByOrderId}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Order ↗
                      </Link>
                    )}
                  </div>
                  <EventSnapshot event={event} />
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* Metadata */}
        <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
          Created {fmtDate(rel.createdAt)}
          {rel.updatedAt > rel.createdAt && <> · Updated {fmtDate(rel.updatedAt)}</>}
        </p>
      </div>
    </div>
  )
}
