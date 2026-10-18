'use client'

import { useActionState } from 'react'
import type { PartnerReferenceResponse } from '@one/shared'
import type { ActionState } from '../[listingId]/actions'
import { createListingAction } from './actions'

const INITIAL: ActionState = { status: 'idle' }
const FIELD =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

export function NewListingForm({ cities }: { cities: PartnerReferenceResponse['cities'] }) {
  const [state, formAction, pending] = useActionState(createListingAction, INITIAL)

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Institute name</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={200}
          autoComplete="organization"
          className={FIELD}
          placeholder="Alpha Academy"
        />
        {state.fieldErrors?.name?.[0] ? (
          <span className="block text-xs text-red-600">{state.fieldErrors.name[0]}</span>
        ) : null}
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">City</span>
        <select name="citySlug" required defaultValue="" className={FIELD}>
          <option value="" disabled>
            Choose a city
          </option>
          {cities.map((city) => (
            <option key={city.slug} value={city.slug}>
              {city.name}, {city.state}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="tap-target w-full rounded-lg bg-brand-500 px-4 text-base font-medium text-white disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'Creating…' : 'Continue'}
      </button>

      {state.status === 'error' && state.message ? (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
