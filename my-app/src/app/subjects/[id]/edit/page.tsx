import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSubjectDetail } from '@/lib/subjects/actions'
import { EditCoreForm } from './_components/edit-core-form'
import { AddressManager } from './_components/address-manager'
import { RoleManager } from './_components/role-manager'
import { DeactivateButton } from './_components/deactivate-button'

type Params = Promise<{ id: string }>

export default async function EditSubjectPage({ params }: { params: Params }) {
  const { id } = await params
  const result = await getSubjectDetail(id)
  if (!result.success) notFound()

  const { subject, addresses, roles } = result.data
  const activeAddresses = addresses.filter(a => a.isActive)
  const activeRoles = roles.filter(r => r.isActive)

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href={`/subjects/${id}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← {subject.displayName}
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-semibold text-gray-900">Edit</h1>
      </div>

      <div className="space-y-10">
        <EditCoreForm detail={result.data} />

        <AddressManager subjectId={id} addresses={activeAddresses} />

        <RoleManager subjectId={id} roles={activeRoles} />

        {subject.isActive && (
          <section>
            <div className="text-xs font-semibold uppercase tracking-wider text-red-400 border-b border-red-100 pb-1.5 mb-4">
              Danger zone
            </div>
            <DeactivateButton id={id} displayName={subject.displayName} />
          </section>
        )}
      </div>
    </div>
  )
}
