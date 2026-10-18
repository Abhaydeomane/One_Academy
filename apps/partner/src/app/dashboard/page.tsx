import { auth } from '@clerk/nextjs/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Badge } from '@one/ui'
import { partnerListingListResponse } from '@one/shared'
import { PartnerApiError, partnerApiGet, partnerErrorMessage } from '@/lib/api'

export const metadata = { title: 'Your listings' }

export default async function DashboardPage() {
  const { orgId } = await auth()
  if (!orgId) redirect('/onboarding')

  let data
  try {
    data = await partnerApiGet('/api/v1/partner/listings', partnerListingListResponse)
  } catch (error) {
    // 503: Clerk was unreachable while the organisation was being provisioned.
    if (error instanceof PartnerApiError && error.status === 503) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h1 className="text-lg font-semibold">Setup didn&apos;t finish</h1>
          <p className="mt-2 text-sm text-gray-700">{partnerErrorMessage(error)}</p>
        </div>
      )
    }
    throw error
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Your listings</h1>

      {data.items.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-600">You have not added an institute yet.</p>
          <Link
            href="/dashboard/new"
            className="tap-target mt-3 inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white sm:w-auto"
          >
            Add your institute
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((listing) => (
            <li key={listing.id}>
              <Link
                href={`/dashboard/${listing.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 active:bg-gray-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold leading-snug text-brand-700">
                    {listing.name}
                  </h2>
                  <Badge>
                    {listing.status === 'DRAFT' && listing.rejectionReason
                      ? 'Changes requested'
                      : listing.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-gray-600">{listing.cityName}</p>
                <p className="mt-2 text-xs text-gray-500">
                  {listing.batchCount} {listing.batchCount === 1 ? 'batch' : 'batches'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data.items.length > 0 ? (
        <Link
          href="/dashboard/new"
          className="tap-target inline-flex w-full items-center justify-center rounded-lg border border-brand-500 px-4 text-sm font-medium text-brand-700 sm:w-auto"
        >
          Add another branch
        </Link>
      ) : null}
    </section>
  )
}
