import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSubjectDetail } from '@/lib/subjects/actions'

type Params = Promise<{ id: string }>

// ── Helpers ────────────────────────────────────────────────────────

function fmtDate(value: string | null | undefined): string | null {
  if (!value) return null
  // Stored as ISO YYYY-MM-DD — display as dd. mm. yyyy
  const [y, m, d] = value.split('-')
  return `${d}. ${m}. ${y}`
}

function fmtTimestamp(value: Date | null | undefined): string | null {
  if (!value) return null
  return value.toLocaleDateString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const ROLE_LABELS: Record<string, string> = {
  CLIENT: 'Client',
  SUPPLIER: 'Supplier',
  PARTNER: 'Partner',
  OTHER: 'Other',
}

const ADDRESS_TYPE_LABELS: Record<string, string> = {
  REGISTERED: 'Registered',
  MAILING: 'Mailing',
  BILLING: 'Billing',
  OPERATIONAL: 'Operational',
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

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  if (children === null || children === undefined || children === '') return null
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5">
      <dt className="text-sm text-gray-500 shrink-0">{label}</dt>
      <dd className="col-span-2 text-sm text-gray-900">{children}</dd>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────

export default async function SubjectDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const result = await getSubjectDetail(id)

  if (!result.success) notFound()

  const { type, subject, profile, addresses, roles } = result.data

  const activeAddresses = addresses.filter(a => a.isActive)
  const activeRoles = roles.filter(r => r.isActive)

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link
            href="/subjects"
            className="text-sm text-gray-500 hover:text-gray-700 mb-3 inline-block"
          >
            ← Subjects
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-gray-900">
              {subject.displayName}
            </h1>
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                type === 'COMPANY'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-violet-50 text-violet-700'
              }`}
            >
              {type === 'COMPANY' ? 'Company' : 'Person'}
            </span>
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                subject.isActive
                  ? 'bg-green-50 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {subject.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
        <Link
          href={`/subjects/${id}/edit`}
          className="shrink-0 border border-gray-300 rounded-md px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Edit
        </Link>
      </div>

      <div className="space-y-8">
        {/* Person profile */}
        {type === 'PERSON' && (
          <Section title="Identity">
            <dl className="divide-y divide-gray-50">
              <Row label="Full name">
                {[profile.titleBefore, profile.firstName, profile.lastName, profile.titleAfter]
                  .filter(Boolean)
                  .join(' ')}
              </Row>
              <Row label="Birth date">{fmtDate(profile.birthDate)}</Row>
              <Row label="Nationality">{profile.nationality}</Row>
            </dl>
          </Section>
        )}

        {/* Company profile */}
        {type === 'COMPANY' && (
          <Section title="Company details">
            <dl className="divide-y divide-gray-50">
              <Row label="Company name">{profile.companyName}</Row>
              <Row label="IČO">{profile.registrationNumber}</Row>
              <Row label="Legal form">{profile.legalForm}</Row>
              <Row label="Registration date">{fmtDate(profile.registrationDate)}</Row>
              <Row label="Registration court">{profile.registrationCourt}</Row>
              <Row label="DIČ">{profile.vatNumber}</Row>
              <Row label="VAT payer">
                {profile.vatPayer ? (
                  <span className="text-green-700">Yes</span>
                ) : (
                  <span className="text-gray-500">No</span>
                )}
              </Row>
            </dl>
          </Section>
        )}

        {/* Contact */}
        {(subject.email || subject.phone) && (
          <Section title="Contact">
            <dl className="divide-y divide-gray-50">
              {subject.email && (
                <Row label="Email">
                  <a
                    href={`mailto:${subject.email}`}
                    className="text-blue-600 hover:underline"
                  >
                    {subject.email}
                  </a>
                </Row>
              )}
              {subject.phone && (
                <Row label="Phone">
                  <a
                    href={`tel:${subject.phone}`}
                    className="text-blue-600 hover:underline"
                  >
                    {subject.phone}
                  </a>
                </Row>
              )}
            </dl>
          </Section>
        )}

        {/* Roles */}
        <Section title="Roles">
          {activeRoles.length === 0 ? (
            <p className="text-sm text-gray-400">No roles assigned.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {activeRoles.map(r => (
                <span
                  key={r.id}
                  className="inline-block px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700"
                >
                  {ROLE_LABELS[r.role] ?? r.role}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* Addresses */}
        <Section title="Addresses">
          {activeAddresses.length === 0 ? (
            <p className="text-sm text-gray-400">No addresses on file.</p>
          ) : (
            <div className="space-y-3">
              {activeAddresses.map(addr => (
                <div
                  key={addr.id}
                  className="border border-gray-200 rounded-lg px-4 py-3 text-sm"
                >
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
              ))}
            </div>
          )}
        </Section>

        {/* Notes */}
        {subject.notes && (
          <Section title="Internal note">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{subject.notes}</p>
          </Section>
        )}

        {/* Tags */}
        {subject.tags && subject.tags.length > 0 && (
          <Section title="Tags">
            <div className="flex flex-wrap gap-2">
              {subject.tags.map(tag => (
                <span
                  key={tag}
                  className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Metadata */}
        <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
          Created {fmtTimestamp(subject.createdAt)}
          {subject.updatedAt > subject.createdAt && (
            <> · Updated {fmtTimestamp(subject.updatedAt)}</>
          )}
        </p>
      </div>
    </div>
  )
}
