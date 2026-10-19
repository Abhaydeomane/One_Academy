import { Badge } from '@one/ui'
import { partnerListingDetail, partnerReferenceResponse } from '@one/shared'
import { partnerApiGet } from '@/lib/api'
import { ActionButton } from './ActionButton'
import { BatchForm } from './BatchForm'
import { PhotosSection } from './PhotosSection'
import { StatusBanner } from './StatusBanner'
import { VerificationForm } from './VerificationForm'
import { publishBatchAction } from './actions'

type Params = Promise<{ listingId: string }>

const RUPEES = new Intl.NumberFormat('en-IN')

export default async function ListingDetailPage({ params }: { params: Params }) {
  const { listingId } = await params
  const [listing, reference] = await Promise.all([
    partnerApiGet(`/api/v1/partner/listings/${listingId}`, partnerListingDetail),
    partnerApiGet('/api/v1/partner/reference', partnerReferenceResponse),
  ])

  return (
    <section className="space-y-7">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">{listing.name}</h1>
          <Badge>{listing.status}</Badge>
        </div>
        <p className="text-sm text-gray-600">{listing.cityName}</p>

        <StatusBanner listing={listing} />
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Verification details</h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <VerificationForm listing={listing} reference={reference} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Photos</h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <PhotosSection
            listingId={listing.id}
            media={listing.media}
            locked={listing.status === 'PENDING_REVIEW'}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Batches</h2>

        {listing.batches.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            No batches yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {listing.batches.map((batch) => (
              <li
                key={batch.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold leading-snug">{batch.title}</h3>
                  <Badge>{batch.status}</Badge>
                </div>

                <p className="mt-1.5 text-sm text-gray-600">
                  {batch.exam} · {batch.mode} · {batch.seatsAvailable}/{batch.seatsTotal} seats · ₹
                  {RUPEES.format(batch.feeAmount / 100)}
                </p>

                {batch.status === 'DRAFT' ? (
                  <div className="pt-3">
                    <ActionButton
                      action={publishBatchAction}
                      label="Publish batch"
                      pendingLabel="Publishing…"
                      hidden={{ listingId, batchId: batch.id }}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Add a batch</h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <BatchForm listingId={listingId} />
        </div>
      </section>
    </section>
  )
}
