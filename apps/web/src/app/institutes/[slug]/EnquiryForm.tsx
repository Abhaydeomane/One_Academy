'use client'

import { useActionState } from 'react'
import { submitEnquiry, type EnquiryFormState } from './actions'

const INITIAL: EnquiryFormState = { status: 'idle' }

const FIELD =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

export function EnquiryForm({
  listingSlug,
  batches,
}: {
  listingSlug: string
  batches: { id: string; title: string }[]
}) {
  const [state, formAction, pending] = useActionState(submitEnquiry, INITIAL)

  if (state.status === 'success') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="text-sm font-medium text-green-800">{state.message}</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="listingSlug" value={listingSlug} />

      <div className="space-y-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Your name</span>
          <input
            name="name"
            required
            minLength={2}
            autoComplete="name"
            className={FIELD}
            placeholder="Asha Rao"
          />
          {state.fieldErrors?.name ? (
            <span className="block text-xs text-red-600">{state.fieldErrors.name[0]}</span>
          ) : null}
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Phone</span>
          {/* type=tel + inputMode brings up the numeric keypad on mobile. */}
          <input
            name="phone"
            type="tel"
            required
            inputMode="numeric"
            pattern="[0-9]{10}"
            maxLength={10}
            autoComplete="tel-national"
            className={FIELD}
            placeholder="10-digit number"
          />
          {state.fieldErrors?.phone ? (
            <span className="block text-xs text-red-600">{state.fieldErrors.phone[0]}</span>
          ) : null}
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          Email <span className="font-normal text-gray-500">(optional)</span>
        </span>
        <input name="email" type="email" autoComplete="email" className={FIELD} />
        {state.fieldErrors?.email ? (
          <span className="block text-xs text-red-600">{state.fieldErrors.email[0]}</span>
        ) : null}
      </label>

      {batches.length > 0 ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            Batch of interest <span className="font-normal text-gray-500">(optional)</span>
          </span>
          <select name="batchId" defaultValue="" className={FIELD}>
            <option value="">Any batch</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          Message <span className="font-normal text-gray-500">(optional)</span>
        </span>
        <textarea name="message" rows={3} maxLength={1000} className={FIELD} />
      </label>

      {state.status === 'error' && state.message ? (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="tap-target w-full rounded-lg bg-brand-500 px-5 text-base font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Request callback'}
      </button>
    </form>
  )
}
