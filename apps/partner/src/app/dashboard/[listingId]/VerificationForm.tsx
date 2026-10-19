'use client'

import { useActionState } from 'react'
import type { PartnerListingDetail, PartnerReferenceResponse } from '@one/shared'
import { updateVerificationAction, type ActionState } from './actions'

const INITIAL: ActionState = { status: 'idle' }
const FIELD =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500 disabled:bg-gray-100'

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null
  return <span className="block text-xs text-red-600">{errors[0]}</span>
}

export function VerificationForm({
  listing,
  reference,
}: {
  listing: PartnerListingDetail
  reference: PartnerReferenceResponse
}) {
  const [state, formAction, pending] = useActionState(updateVerificationAction, INITIAL)
  // BR-017: nothing changes while One Academy is reviewing it.
  const locked = listing.status === 'PENDING_REVIEW'
  // BR-002: the public address embeds the city, so it is fixed once public.
  const cityFixed = listing.firstPublishedAt !== null
  const echoed = state.status === 'error' ? state.values : undefined
  const str = (key: string, fallback: string) => {
    const value = echoed?.[key]
    return typeof value === 'string' ? value : fallback
  }
  const checkedExams = Array.isArray(echoed?.examSlugs) ? echoed.examSlugs : listing.exams
  const city = str('citySlug', listing.citySlug)

  return (
    <form
      // Remount on an error result so inputs pick up the echoed values.
      key={echoed ? JSON.stringify(echoed) + state.message : 'form'}
      action={formAction}
      className="space-y-4"
    >
      <input type="hidden" name="listingId" value={listing.id} />
      <input type="hidden" name="hadAddress" value={listing.address ? '1' : '0'} />
      <input type="hidden" name="hadContactPhone" value={listing.contactPhone ? '1' : '0'} />
      <input type="hidden" name="hadExams" value={listing.exams.length > 0 ? '1' : '0'} />

      {locked ? (
        <p className="text-sm text-gray-600">
          These details can&apos;t change while we review them. Withdraw your listing to make
          changes.
        </p>
      ) : null}

      <fieldset disabled={locked} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">City</span>
          <select name="citySlug" defaultValue={city} disabled={cityFixed} className={FIELD}>
            {reference.cities.map((city) => (
              <option key={city.slug} value={city.slug}>
                {city.name}, {city.state}
              </option>
            ))}
          </select>
          {cityFixed ? (
            <span className="block text-xs text-gray-500">
              The city can&apos;t change once your listing has been public.
            </span>
          ) : null}
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Full address</span>
          <textarea
            name="address"
            rows={3}
            maxLength={300}
            autoComplete="street-address"
            defaultValue={str('address', listing.address ?? '')}
            className={FIELD}
            placeholder="Building, street, area, city, PIN code"
          />
          <FieldError errors={state.fieldErrors?.address} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Contact phone</span>
          <input
            name="contactPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            defaultValue={str('contactPhone', listing.contactPhone ?? '')}
            className={FIELD}
            placeholder="98765 43210"
          />
          <span className="block text-xs text-gray-500">Private — only One Academy sees this</span>
          <FieldError errors={state.fieldErrors?.contactPhone} />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Exams you coach for</legend>
          <div className="flex flex-wrap gap-2">
            {reference.exams.map((exam) => (
              <label key={exam.slug} className="tap-target inline-flex cursor-pointer">
                <input
                  type="checkbox"
                  name="examSlugs"
                  value={exam.slug}
                  defaultChecked={checkedExams.includes(exam.slug)}
                  className="peer sr-only"
                />
                <span className="inline-flex items-center rounded-full border border-gray-300 px-4 text-sm peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-brand-500">
                  {exam.label}
                </span>
              </label>
            ))}
          </div>
          <FieldError errors={state.fieldErrors?.examSlugs} />
        </fieldset>
      </fieldset>

      {locked ? null : (
        <button
          type="submit"
          disabled={pending}
          className="tap-target w-full rounded-lg border border-brand-500 px-4 text-sm font-medium text-brand-700 disabled:opacity-60 sm:w-auto"
        >
          {pending ? 'Saving…' : 'Save details'}
        </button>
      )}

      {state.message ? (
        <p
          role={state.status === 'error' ? 'alert' : 'status'}
          className={state.status === 'error' ? 'text-sm text-red-600' : 'text-sm text-green-700'}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
