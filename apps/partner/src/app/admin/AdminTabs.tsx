'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

const TABS = [
  { tab: 'review', label: 'Review' },
  { tab: 'changed', label: 'Changed' },
  { tab: 'published', label: 'Published' },
  { tab: 'suspended', label: 'Suspended' },
] as const

/// Scrolls sideways on a phone rather than wrapping, so the row stays one line.
export function AdminTabs() {
  const pathname = usePathname()
  const tab = useSearchParams().get('tab') ?? 'review'
  const current = pathname === '/admin/review' ? tab : null

  return (
    <nav aria-label="Admin" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2 whitespace-nowrap">
        {TABS.map(({ tab, label }) => (
          <li key={tab}>
            <Link
              href={`/admin/review?tab=${tab}`}
              aria-current={current === tab ? 'page' : undefined}
              className={`tap-target inline-flex items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                current === tab
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-300 text-gray-700'
              }`}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
