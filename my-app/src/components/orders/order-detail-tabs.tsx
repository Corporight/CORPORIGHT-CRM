import Link from 'next/link'

const TABS = [
  { key: 'overview', label: 'Přehled' },
  { key: 'income', label: 'Finance — Příjmy' },
  { key: 'expenses', label: 'Finance — Výdaje' },
] as const

type TabKey = (typeof TABS)[number]['key']

export function OrderDetailTabs({
  orderId,
  activeTab,
}: {
  orderId: string
  activeTab: TabKey | string
}) {
  return (
    <div className="flex gap-0 border-b mb-6">
      {TABS.map(({ key, label }) => {
        const isActive = activeTab === key
        return (
          <Link
            key={key}
            href={`/orders/${orderId}?tab=${key}`}
            className={[
              'px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors whitespace-nowrap',
              isActive
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground',
            ].join(' ')}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
