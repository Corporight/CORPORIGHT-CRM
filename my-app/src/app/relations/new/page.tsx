import Link from 'next/link'
import { CreateRelationForm } from './_components/create-relation-form'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function NewRelationPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams
  const raw = typeof sp.subjectAId === 'string' ? sp.subjectAId : undefined
  const subjectAId = raw && UUID_RE.test(raw) ? raw : undefined

  return (
    <div className="px-6 py-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/relations" className="text-sm text-gray-500 hover:text-gray-700">
          ← Relations
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-semibold text-gray-900">New relation</h1>
      </div>
      <CreateRelationForm subjectAId={subjectAId} />
    </div>
  )
}
