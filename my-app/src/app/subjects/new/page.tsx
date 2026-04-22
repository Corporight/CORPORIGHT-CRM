import Link from 'next/link'
import { CreatePersonForm } from './_components/create-person-form'
import { CreateCompanyForm } from './_components/create-company-form'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function NewSubjectPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams
  const raw = sp.type
  const type =
    raw === 'PERSON' ? 'PERSON' : raw === 'COMPANY' ? 'COMPANY' : null

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/subjects"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Subjects
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-semibold text-gray-900">
          {type === 'PERSON'
            ? 'New Person'
            : type === 'COMPANY'
            ? 'New Company'
            : 'New Subject'}
        </h1>
      </div>

      {!type && (
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/subjects/new?type=PERSON"
            className="border-2 border-gray-200 rounded-xl p-6 hover:border-gray-400 hover:bg-gray-50 transition-colors"
          >
            <div className="text-base font-semibold text-gray-900 mb-1">
              Person
            </div>
            <div className="text-sm text-gray-500">
              Individual — first and last name required
            </div>
          </Link>
          <Link
            href="/subjects/new?type=COMPANY"
            className="border-2 border-gray-200 rounded-xl p-6 hover:border-gray-400 hover:bg-gray-50 transition-colors"
          >
            <div className="text-base font-semibold text-gray-900 mb-1">
              Company
            </div>
            <div className="text-sm text-gray-500">
              Legal entity — company name and IČO required
            </div>
          </Link>
        </div>
      )}

      {type === 'PERSON' && <CreatePersonForm />}
      {type === 'COMPANY' && <CreateCompanyForm />}
    </div>
  )
}
