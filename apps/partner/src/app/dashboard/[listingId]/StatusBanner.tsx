import {
  missingForSubmission,
  SUBMISSION_FIELD_LABELS,
  SUBMISSION_FIELDS,
  type PartnerListingDetail,
} from '@one/shared'
import { ActionButton } from './ActionButton'
import { submitListingAction } from './actions'

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
      </div>
    )
  }

  if (listing.status === 'PENDING_REVIEW') {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-gray-700">
        We&apos;re reviewing your institute. This usually takes 1–2 working days.
      </p>
    )
  }

  if (listing.status === 'SUSPENDED') {
    return (
      <p className="rounded-lg border border-gray-300 bg-gray-100 p-3 text-sm text-gray-700">
        This listing is suspended. Contact One Academy.
      </p>
    )
  }

  const missing = missingForSubmission({
    name: listing.name,
    cityName: listing.cityName,
    address: listing.address,
    contactPhone: listing.contactPhone,
    exams: listing.exams,
  })

  return (
    <div className="space-y-3">
      {listing.rejectionReason ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <p className="font-medium text-red-700">Changes requested</p>
          <p className="mt-1 text-gray-700">{listing.rejectionReason}</p>
          <p className="mt-1 text-gray-700">Fix the details below and submit again.</p>
        </div>
      ) : null}

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
