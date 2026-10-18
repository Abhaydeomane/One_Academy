'use client'

import { useActionState, useState } from 'react'
import type { ActionState } from '@/app/dashboard/[listingId]/actions'
import { approveAction, rejectAction } from './actions'

const INITIAL: ActionState = { status: 'idle' }

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

export function ReviewActions({
  listingId,
  approveLabel,
}: {
  listingId: string
  approveLabel: string
}) {
  const [approveState, approve, approving] = useActionState(approveAction, INITIAL)
  const [rejectState, reject, rejecting] = useActionState(rejectAction, INITIAL)
  const [rejectOpen, setRejectOpen] = useState(false)

  const reasonError = rejectState.status === 'error'
  const reason = rejectState.values?.reason
  const retained = typeof reason === 'string' ? reason : ''

  return (
    <div className="space-y-4">
      <form action={approve} className="space-y-2">
        <input type="hidden" name="listingId" value={listingId} />
        <button
          type="submit"
          disabled={approving}
          className={`tap-target w-full rounded-lg bg-brand-500 px-4 text-base font-medium text-white disabled:opacity-60 sm:w-auto ${FOCUS}`}
        >
          {approving ? 'Publishing…' : approveLabel}
        </button>
        {approveState.message ? (
          <p role="alert" className="text-sm text-red-600">
            {approveState.message}
          </p>
        ) : null}
      </form>

      {rejectOpen ? (
        <form action={reject} className="space-y-2">
          <input type="hidden" name="listingId" value={listingId} />
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Reason (the institute sees this)</span>
            <textarea
              // Remount on error so the retained reason replaces the reset form value.
              key={reasonError ? `error-${retained}` : 'fresh'}
              name="reason"
              rows={3}
              required
              minLength={10}
              maxLength={500}
              defaultValue={retained}
              aria-invalid={reasonError || undefined}
              className={`w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base ${FOCUS}`}
            />
          </label>
          <button
            type="submit"
            disabled={rejecting}
            className={`tap-target w-full rounded-lg border border-red-600 px-4 text-base font-medium text-red-700 disabled:opacity-60 sm:w-auto ${FOCUS}`}
          >
            {rejecting ? 'Rejecting…' : 'Reject with this reason'}
          </button>
          {rejectState.message ? (
            <p role="alert" className="text-sm text-red-600">
              {rejectState.message}
            </p>
          ) : null}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setRejectOpen(true)}
          className={`tap-target w-full rounded-lg border border-gray-300 px-4 text-base font-medium text-gray-700 sm:w-auto ${FOCUS}`}
        >
          Reject…
        </button>
      )}
    </div>
  )
}
