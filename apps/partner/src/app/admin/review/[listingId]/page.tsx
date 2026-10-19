import { adminListingDetail, safeHttpUrl } from '@one/shared'
import { partnerApiGet } from '@/lib/api'
import { ChangesList } from './ChangesList'
import { LiftSuspension, LooksFine, SuspendForm } from './ModerationActions'
import { ReviewActions } from './ReviewActions'

export const metadata = { title: 'Listing' }

const DATE = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' })

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
  searchParams,
}: {
  params: Promise<{ listingId: string }>
  searchParams: Promise<{ stale?: string }>
}) {
  const { listingId } = await params
  const { stale } = await searchParams
  const listing = await partnerApiGet(`/api/v1/admin/listings/${listingId}`, adminListingDetail)
  const approveLabel = listing.newInstitute
    ? `Approve & publish (also verifies ${listing.organizationName})`
    : 'Approve & publish'

  return (
    <section className="space-y-5">
      <h1 className="text-xl font-bold leading-tight sm:text-2xl">{listing.name}</h1>
      <p className="text-sm text-gray-600">
        Status: {listing.status.replaceAll('_', ' ').toLowerCase()}
      </p>
      {stale ? (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          This listing changed — reload. The changes below are the latest.
        </p>
      ) : null}
      {listing.status === 'PENDING_REVIEW' && listing.suspensionReason ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          Previously suspended: {listing.suspensionReason}
        </p>
      ) : null}
      {listing.rejectionReason ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          Previously rejected: {listing.rejectionReason}
        </p>
      ) : null}

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
          {safeHttpUrl(listing.website) ? (
            <a
              href={safeHttpUrl(listing.website) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`tap-target inline-flex items-center break-all text-brand-700 underline ${LINK_FOCUS}`}
            >
              {listing.website}
            </a>
          ) : (
            (listing.website ?? '—')
          )}
        </Row>
        <Row label="Exams">{listing.exams.map((exam) => exam.toUpperCase()).join(', ') || '—'}</Row>
        <Row label="Modes">{listing.modes.join(', ') || '—'}</Row>
        <Row label="Batches">{listing.batchCount}</Row>
        {listing.about ? <Row label="About">{listing.about}</Row> : null}
      </dl>

      {listing.status === 'PENDING_REVIEW' ? (
        <ReviewActions listingId={listing.id} approveLabel={approveLabel} />
      ) : null}

      {listing.status === 'PUBLISHED' ? (
        <div className="space-y-5">
          {listing.changes.length > 0 && listing.changedSinceReviewAt ? (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Changed since approval</h2>
              <ChangesList changes={listing.changes} />
              <LooksFine
                listingId={listing.id}
                changedSinceReviewAt={listing.changedSinceReviewAt}
              />
            </section>
          ) : null}
          <SuspendForm listingId={listing.id} listingName={listing.name} />
        </div>
      ) : null}

      {listing.status === 'SUSPENDED' ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
            Suspended
            {listing.suspendedAt ? ` on ${DATE.format(new Date(listing.suspendedAt))}` : ''}:{' '}
            {listing.suspensionReason ?? 'no reason recorded'}
          </p>
          <LiftSuspension listingId={listing.id} />
        </div>
      ) : null}
    </section>
  )
}
