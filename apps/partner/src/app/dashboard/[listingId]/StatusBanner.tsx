import {
  missingForSubmission,
  SUBMISSION_FIELD_LABELS,
  SUBMISSION_FIELDS,
  type PartnerListingDetail,
} from '@one/shared'
import { ActionButton } from './ActionButton'
import { submitListingAction, withdrawListingAction } from './actions'

// No localhost fallback in production: a missing variable must not link
// published partners to localhost, so the link is omitted instead.
const WEB_BASE_URL =
  process.env.WEB_BASE_URL ??
  (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : undefined)

export function StatusBanner({ listing }: { listing: PartnerListingDetail }) {
  if (listing.status === 'PUBLISHED') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-gray-700">
        Live on One Academy.
        {WEB_BASE_URL ? (
          <>
            {' '}
            <a
              href={`${WEB_BASE_URL}/institutes/${listing.slug}`}
              className="tap-target inline-flex items-center font-medium text-brand-700 underline"
            >
              View your public page
            </a>
          </>
        ) : null}
        <p className="mt-1 text-xs text-gray-600">
          Changes go live straight away and may be checked by One Academy.
        </p>
      </div>
    )
  }

  if (listing.status === 'PENDING_REVIEW') {
    return (
      <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-gray-700">
        <p>We&apos;re reviewing your institute. This usually takes 1–2 working days.</p>
        <ActionButton
          action={withdrawListingAction}
          label="Withdraw to make changes"
          pendingLabel="Withdrawing…"
          hidden={{ listingId: listing.id }}
          confirm="Your listing will leave the review queue. Submit again when you're done."
        />
      </div>
    )
  }

  if (listing.status === 'SUSPENDED') {
    return (
      <div className="space-y-3">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <p className="font-medium text-red-700">Your listing has been taken off One Academy.</p>
          {listing.suspensionReason ? (
            <p className="mt-1 text-gray-700">{listing.suspensionReason}</p>
          ) : null}
          {listing.rejectionReason ? (
            <p className="mt-1 text-gray-700">Latest review: {listing.rejectionReason}</p>
          ) : null}
          <p className="mt-1 text-gray-700">Fix the details below and submit for review again.</p>
        </div>
        <SubmitChecklist listing={listing} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {listing.rejectionReason ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <p className="font-medium text-red-700">Changes requested</p>
          <p className="mt-1 text-gray-700">{listing.rejectionReason}</p>
          <p className="mt-1 text-gray-700">Fix the details below and submit again.</p>
        </div>
      ) : null}
      <SubmitChecklist listing={listing} />
    </div>
  )
}

/// BR-012: what is still missing, and the submit button once nothing is.
function SubmitChecklist({ listing }: { listing: PartnerListingDetail }) {
  const missing = missingForSubmission({
    name: listing.name,
    cityName: listing.cityName,
    address: listing.address,
    contactPhone: listing.contactPhone,
    exams: listing.exams,
  })

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-3 text-sm">
        {SUBMISSION_FIELDS.map((field) => {
          const done = !missing.includes(field)
          return (
            <li key={field} className={done ? 'text-gray-700' : 'text-gray-500'}>
              <span aria-hidden="true">{done ? '✓' : '○'}</span>{' '}
              <span className="sr-only">{done ? 'Done:' : 'To do:'}</span>
              {SUBMISSION_FIELD_LABELS[field]}
            </li>
          )
        })}
      </ul>

      {missing.length === 0 ? (
        <ActionButton
          action={submitListingAction}
          label="Submit for review"
          pendingLabel="Submitting…"
          variant="primary"
          hidden={{ listingId: listing.id }}
        />
      ) : (
        <p className="text-sm text-gray-600">Complete the items above to submit for review.</p>
      )}
    </div>
  )
}
