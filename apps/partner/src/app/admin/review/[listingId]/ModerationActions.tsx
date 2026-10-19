'use client'

import { useActionState, useState } from 'react'
import type { ActionState } from '@/app/dashboard/[listingId]/actions'
import { markReviewedAction, reinstateAction, suspendAction } from './actions'

const INITIAL: ActionState = { status: 'idle' }

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

function Message({ state }: { state: ActionState }) {
  if (!state.message) return null
  return (
    <p role="alert" className="text-sm text-red-600">
      {state.message}
    </p>
  )
}

/// "Looks fine": accepts the listed changes as the new approved baseline
/// (BR-018). Carries the token the page was rendered with.
export function LooksFine({
  listingId,
  changedSinceReviewAt,
}: {
  listingId: string
  changedSinceReviewAt: string
}) {
  const [state, action, pending] = useActionState(markReviewedAction, INITIAL)
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="changedSinceReviewAt" value={changedSinceReviewAt} />
      <button
        type="submit"
        disabled={pending}
        className={`tap-target w-full rounded-lg bg-brand-500 px-4 text-base font-medium text-white disabled:opacity-60 sm:w-auto ${FOCUS}`}
      >
        {pending ? 'Saving…' : 'Looks fine'}
      </button>
      <Message state={state} />
    </form>
  )
}

/// BR-015: takes a live listing off the site, with a reason the institute sees.
export function SuspendForm({
  listingId,
  listingName,
}: {
  listingId: string
  listingName: string
}) {
  const [state, action, pending] = useActionState(suspendAction, INITIAL)
  const [open, setOpen] = useState(false)
  const failed = state.status === 'error'
  const reason = state.values?.reason
  const retained = typeof reason === 'string' ? reason : ''

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`tap-target w-full rounded-lg border border-red-600 px-4 text-base font-medium text-red-700 sm:w-auto ${FOCUS}`}
      >
        Suspend…
      </button>
    )
  }

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Suspend ${listingName}? It will be removed from the site.`)) {
          event.preventDefault()
        }
      }}
      className="space-y-2"
    >
      <input type="hidden" name="listingId" value={listingId} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Reason (the institute sees this)</span>
        <textarea
          // Remount on error so the retained reason replaces the reset form value.
          key={failed ? `error-${retained}` : 'fresh'}
          name="reason"
          rows={3}
          required
          minLength={10}
          maxLength={500}
          defaultValue={retained}
          aria-invalid={failed || undefined}
          className={`w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base ${FOCUS}`}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className={`tap-target w-full rounded-lg bg-red-600 px-4 text-base font-medium text-white disabled:opacity-60 sm:w-auto ${FOCUS}`}
      >
        {pending ? 'Suspending…' : 'Suspend with this reason'}
      </button>
      <Message state={state} />
    </form>
  )
}

/// BR-016: puts a suspended listing straight back on the site.
export function LiftSuspension({ listingId }: { listingId: string }) {
  const [state, action, pending] = useActionState(reinstateAction, INITIAL)
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="listingId" value={listingId} />
      <button
        type="submit"
        disabled={pending}
        className={`tap-target w-full rounded-lg bg-brand-500 px-4 text-base font-medium text-white disabled:opacity-60 sm:w-auto ${FOCUS}`}
      >
        {pending ? 'Lifting…' : 'Lift suspension'}
      </button>
      <Message state={state} />
    </form>
  )
}
