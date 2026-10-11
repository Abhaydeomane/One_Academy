import Link from 'next/link'
import { Badge } from '@one/ui'
import { partnerListingListResponse } from '@one/shared'
import { PartnerApiError, partnerApiGet } from '@/lib/api'

export const metadata = { title: 'Your listings' }

export default async function DashboardPage() {
  let data
  try {
    data = await partnerApiGet('/api/v1/partner/listings', partnerListingListResponse)
  } catch (error) {
    // A Clerk organisation One Academy has not onboarded yet is a normal state,
    // not an error page.
    if (error instanceof PartnerApiError && error.status === 403) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h1 className="text-lg font-semibold">No organisation selected</h1>
          <p className="mt-2 text-sm text-gray-700">
            Your account is not linked to an institute yet. Create or select an organisation, then
            reload this page.
          </p>
        </div>
      )
    }
    throw error
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold sm:text-2xl">Your listings</h1>

      {data.items.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          No listings yet. Contact One Academy to have your institute added.
        </p>
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
                  <Badge>{listing.status}</Badge>
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
    </section>
  )
}
