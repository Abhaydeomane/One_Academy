'use client'

import { useActionState } from 'react'
import type { PartnerListingDetail, PartnerReferenceResponse } from '@one/shared'
import { updateVerificationAction, type ActionState } from './actions'

const INITIAL: ActionState = { status: 'idle' }
const FIELD =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-gray-100'

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
  const cityEditable = listing.status === 'DRAFT'

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="listingId" value={listing.id} />

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">City</span>
        <select
          name="citySlug"
          defaultValue={listing.citySlug}
          disabled={!cityEditable}
          className={FIELD}
        >
          {reference.cities.map((city) => (
            <option key={city.slug} value={city.slug}>
              {city.name}, {city.state}
            </option>
          ))}
        </select>
        {cityEditable ? null : (
          <span className="block text-xs text-gray-500">
            The city is fixed once a listing has been submitted.
          </span>
        )}
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Full address</span>
        <textarea
          name="address"
          rows={3}
          maxLength={300}
          autoComplete="street-address"
          defaultValue={listing.address ?? ''}
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
          defaultValue={listing.contactPhone ?? ''}
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
                defaultChecked={listing.exams.includes(exam.slug)}
                className="peer sr-only"
              />
              <span className="inline-flex items-center rounded-full border border-gray-300 px-4 text-sm peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-100">
                {exam.label}
              </span>
            </label>
          ))}
        </div>
        <FieldError errors={state.fieldErrors?.examSlugs} />
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="tap-target w-full rounded-lg border border-brand-500 px-4 text-sm font-medium text-brand-700 disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'Saving…' : 'Save details'}
      </button>

      {state.message ? (
        <p
          role={state.status === 'error' ? 'alert' : undefined}
          className={state.status === 'error' ? 'text-sm text-red-600' : 'text-sm text-green-700'}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
