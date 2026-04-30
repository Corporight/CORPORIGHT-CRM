'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  CheckSquare,
  ClipboardList,
  RefreshCcw,
  FileText,
  Folder,
  Users,
  Network,
  History,
  Building2,
  Receipt,
  TrendingUp,
  BarChart2,
  Shield,
  Settings,
  Wrench,
  CreditCard,
  UserCog,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href?: string
  icon: React.ElementType
  exact?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: '',
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: 'ToDo',
    items: [
      { label: 'Přehled úkolů', icon: CheckSquare },
    ],
  },
  {
    label: 'Objednávky',
    items: [
      { label: 'Přehled objednávek', href: '/orders', icon: ClipboardList },
      { label: 'Dlouhodobé služby', icon: RefreshCcw },
      { label: 'Klientské formuláře', icon: FileText },
      { label: 'Dokumenty', icon: Folder },
    ],
  },
  {
    label: 'Subjekty',
    items: [
      { label: 'Přehled subjektů', href: '/subjects', icon: Users },
    ],
  },
  {
    label: 'Vazby',
    items: [
      { label: 'Přehled vazeb', href: '/relations', icon: Network },
      { label: 'Historie vazeb', icon: History },
    ],
  },
  {
    label: 'Společnosti k prodeji',
    items: [
      { label: 'Přehled společností', icon: Building2 },
      { label: 'VAT Registrace', icon: Receipt },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Platební skupiny', href: '/finance/payment-groups', icon: TrendingUp },
      { label: 'Přehled pohybů', icon: BarChart2 },
    ],
  },
  {
    label: 'AML',
    items: [
      { label: 'Přehled AML', icon: Shield },
    ],
  },
  {
    label: 'Administrace',
    items: [
      { label: 'Nastavení služeb', icon: Settings },
      { label: 'Nastavení živností', icon: Wrench },
      { label: 'Nastavení financí', icon: CreditCard },
      { label: 'Uživatelé a oprávnění', icon: UserCog },
    ],
  },
]

export function CrmSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex flex-col w-56 shrink-0 h-full bg-sidebar border-r border-sidebar-border">
      {/* Brand */}
      <div className="flex items-baseline gap-1.5 h-14 px-4 border-b border-sidebar-border shrink-0">
        <span className="text-sm font-semibold tracking-tight text-gray-900">Corporight</span>
        <span className="text-[10px] font-medium uppercase tracking-widest text-gray-400">CRM</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2" aria-label="Hlavní navigace">
        {NAV_GROUPS.map((group, groupIndex) => {
          const hasLabel = group.label.length > 0
          return (
            <div key={groupIndex} className="mb-1">
              {hasLabel && (
                <div className="px-4 pt-4 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                    {group.label}
                  </span>
                </div>
              )}
              <ul className={cn('space-y-0.5 px-2', !hasLabel && 'pt-2')}>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = item.href
                    ? item.exact
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(item.href + '/')
                    : false

                  if (!item.href) {
                    return (
                      <li key={item.label}>
                        <span
                          className="flex items-center gap-2 pl-[10px] pr-2 py-1.5 text-sm text-gray-400 rounded-md cursor-default select-none border-l-2 border-transparent"
                          aria-disabled="true"
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </span>
                      </li>
                    )
                  }

                  return (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2 py-1.5 pr-2 text-sm rounded-md transition-colors border-l-2 pl-[10px]',
                          isActive
                            ? 'border-coral text-gray-900 font-medium bg-gray-50'
                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-3.5 w-3.5 shrink-0',
                            isActive ? 'text-coral' : ''
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
