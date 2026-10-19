import { notFound } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { isAdmin } from '@/lib/admin'
import { AdminTabs } from './AdminTabs'

/// A 404 rather than a 403, so a non-admin learns nothing about this area.
/// The API's requireAdmin is the real enforcement.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!(await isAdmin())) notFound()
  return (
    <div className="space-y-5">
      {/* AdminTabs reads the query string, which needs a Suspense boundary. */}
      <Suspense>
        <AdminTabs />
      </Suspense>
      {children}
    </div>
  )
}
