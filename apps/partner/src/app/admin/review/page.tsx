import Link from 'next/link'
import { Badge } from '@one/ui'
import { adminListingQueueResponse, type AdminListingSummary } from '@one/shared'
import { partnerApiGet } from '@/lib/api'

export const metadata = { title: 'Moderation' }

type Tab = 'review' | 'changed' | 'published' | 'suspended'

const TABS: Record<Tab, { title: string; query: string; empty: string }> = {
  review: {
    title: 'Review queue',
    query: 'status=PENDING_REVIEW',
    empty: 'Nothing waiting for review.',
  },
  changed: {
    title: 'Changed since approval',
    query: 'changed=true',
    empty: 'No unreviewed changes.',
  },
  published: {
    title: 'Published',
    query: 'status=PUBLISHED',
    empty: 'No published listings match.',
  },
  suspended: { title: 'Suspended', query: 'status=SUSPENDED', empty: 'Nothing is suspended.' },
}

const NOTICES: Record<string, string> = {
  published: 'Published. It is now on the site.',
  'published-slow': 'Published. It will appear on the site within 5 minutes.',
  rejected: 'Rejected. The institute will see your reason on their dashboard.',
  suspended: 'Suspended. Removed from the site.',
  'suspended-slow': 'Suspended. It may stay visible for up to 5 minutes.',
  reinstated: 'Suspension lifted. Back on the site.',
  'reinstated-slow': 'Suspension lifted. It may take up to 5 minutes to reappear.',
  reviewed: 'Marked as reviewed.',
  already: 'This listing changed — reload',
}

const RELATIVE = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' })
const DATE = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' })

function ago(iso: string): string {
  return RELATIVE.format(Math.round((Date.parse(iso) - Date.now()) / 86_400_000), 'day')
}

function detail(tab: Tab, item: AdminListingSummary): string {
  if (tab === 'changed' && item.changedSinceReviewAt) {
    const fields = item.changedFieldCount === 1 ? 'field' : 'fields'
    return `${item.changedFieldCount} ${fields} changed, ${ago(item.changedSinceReviewAt)}`
  }
  if (tab === 'review') {
    return item.submittedAt ? `submitted ${ago(item.submittedAt)}` : 'submission time unknown'
  }
  return `updated ${DATE.format(new Date(item.updatedAt))}`
}

export default async function ModerationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; done?: string; q?: string }>
}) {
  const { tab: rawTab, done, q } = await searchParams
  const tab: Tab = rawTab && Object.hasOwn(TABS, rawTab) ? (rawTab as Tab) : 'review'
  const config = TABS[tab]
  const search = tab === 'published' && q?.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''
  const queue = await partnerApiGet(
    `/api/v1/admin/listings?${config.query}${search}&limit=50`,
    adminListingQueueResponse,
  )
  const notice = done && Object.hasOwn(NOTICES, done) ? NOTICES[done] : undefined
  const warning = done === 'already' || done?.endsWith('-slow')

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">{config.title}</h1>

      {notice ? (
        <p
          role="status"
          className={`rounded-lg border p-3 text-sm ${
            warning ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'
          }`}
        >
          {notice}
        </p>
      ) : null}

      {tab === 'published' ? (
        <form role="search" className="flex gap-2">
          <input type="hidden" name="tab" value="published" />
          <label className="flex-1">
            <span className="sr-only">Name or web address</span>
            <input
              type="search"
              name="q"
              defaultValue={q ?? ''}
              placeholder="Name or web address"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </label>
          <button
            type="submit"
            className="tap-target rounded-lg border border-brand-500 px-4 text-sm font-medium text-brand-700"
          >
            Search
          </button>
        </form>
      ) : null}

      {queue.total > queue.items.length ? (
        <p className="text-sm text-gray-600">
          Showing {queue.items.length} of {queue.total}.
        </p>
      ) : null}

      {queue.items.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          {config.empty}
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
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {item.newInstitute ? <Badge>New institute</Badge> : null}
                    {item.resubmittedAfterSuspension ? (
                      <Badge>Resubmitted after suspension</Badge>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {item.organizationName} · {item.cityName}
                </p>
                {tab === 'suspended' && item.suspensionReason ? (
                  <p className="mt-1 line-clamp-2 text-sm text-gray-700">{item.suspensionReason}</p>
                ) : null}
                <p className="mt-2 text-xs text-gray-500">{detail(tab, item)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
