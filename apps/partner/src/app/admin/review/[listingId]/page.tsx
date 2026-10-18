import { adminListingDetail } from '@one/shared'
import { partnerApiGet } from '@/lib/api'
import { ReviewActions } from './ReviewActions'

export const metadata = { title: 'Review listing' }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-base text-gray-900">{children}</dd>
    </div>
  )
}

const LINK_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded'

export default async function ReviewListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>
}) {
  const { listingId } = await params
  const listing = await partnerApiGet(`/api/v1/admin/listings/${listingId}`, adminListingDetail)
  const approveLabel = listing.newInstitute
    ? `Approve & publish (also verifies ${listing.organizationName})`
    : 'Approve & publish'

  return (
    <section className="space-y-5">
      <h1 className="text-xl font-bold leading-tight sm:text-2xl">{listing.name}</h1>

      <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-4">
        <Row label="Organisation">
          {listing.organizationName}
          {listing.newInstitute ? ' — new institute' : ''}
        </Row>
        <Row label="City">
          {listing.locality ? `${listing.locality}, ` : ''}
          {listing.cityName}
        </Row>
        <Row label="Address">{listing.address ?? '—'}</Row>
        <Row label="Contact phone">
          {listing.contactPhone ? (
            <a
              href={`tel:+91${listing.contactPhone}`}
              className={`tap-target inline-flex items-center font-medium text-brand-700 underline ${LINK_FOCUS}`}
            >
              {listing.contactPhone}
            </a>
          ) : (
            '—'
          )}
        </Row>
        <Row label="Website">
          {listing.website ? (
            <a
              href={listing.website}
              target="_blank"
              rel="noopener noreferrer"
              className={`tap-target inline-flex items-center break-all text-brand-700 underline ${LINK_FOCUS}`}
            >
              {listing.website}
            </a>
          ) : (
            '—'
          )}
        </Row>
        <Row label="Exams">{listing.exams.map((exam) => exam.toUpperCase()).join(', ') || '—'}</Row>
        <Row label="Modes">{listing.modes.join(', ') || '—'}</Row>
        <Row label="Batches">{listing.batchCount}</Row>
        {listing.about ? <Row label="About">{listing.about}</Row> : null}
      </dl>

      <ReviewActions listingId={listing.id} approveLabel={approveLabel} />
    </section>
  )
}
