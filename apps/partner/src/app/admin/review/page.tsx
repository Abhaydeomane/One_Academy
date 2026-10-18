import Link from 'next/link'
import { Badge } from '@one/ui'
import { adminListingQueueResponse } from '@one/shared'
import { partnerApiGet } from '@/lib/api'

export const metadata = { title: 'Review queue' }

const NOTICES: Record<string, string> = {
  published: 'Published. It will appear on the site within 5 minutes.',
  rejected: 'Rejected. The institute will see your reason on their dashboard.',
  already: 'This listing was already reviewed',
}

const RELATIVE = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' })

function waited(iso: string | null): string {
  if (!iso) return 'submission time unknown'
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000)
  return `submitted ${RELATIVE.format(days, 'day')}`
}

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>
}) {
  const { done } = await searchParams
  const queue = await partnerApiGet(
    '/api/v1/admin/listings?status=PENDING_REVIEW&limit=50',
    adminListingQueueResponse,
  )
  const notice = done ? NOTICES[done] : undefined

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Review queue</h1>

      {notice ? (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
          {notice}
        </p>
      ) : null}

      {queue.items.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          Nothing waiting for review.
        </p>
      ) : (
        <ul className="space-y-3">
          {queue.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/admin/review/${item.id}`}
                className="tap-target block rounded-lg border border-gray-200 bg-white p-4 active:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold leading-snug text-brand-700">
                    {item.name}
                  </h2>
                  {item.newInstitute ? <Badge>New institute</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {item.organizationName} · {item.cityName}
                </p>
                <p className="mt-2 text-xs text-gray-500">{waited(item.submittedAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
