'use client'

import { useActionState } from 'react'
import { createBatchAction, type ActionState } from './actions'

const INITIAL: ActionState = { status: 'idle' }

const FIELD =
  'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.[0]) return null
  return <span className="block text-xs text-red-600">{errors[0]}</span>
}

export function BatchForm({ listingId }: { listingId: string }) {
  const [state, formAction, pending] = useActionState(createBatchAction, INITIAL)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="listingId" value={listingId} />

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Batch title</span>
        <input
          name="title"
          required
          minLength={2}
          className={FIELD}
          placeholder="JEE 2028 Morning"
        />
        <FieldError errors={state.fieldErrors?.title} />
      </label>

      <div className="space-y-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Exam</span>
          <input name="exam" required className={FIELD} placeholder="JEE" />
          <FieldError errors={state.fieldErrors?.exam} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Mode</span>
          <select name="mode" defaultValue="OFFLINE" className={FIELD}>
            <option value="OFFLINE">Offline</option>
            <option value="ONLINE">Online</option>
            <option value="HYBRID">Hybrid</option>
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Start date</span>
          <input name="startDate" type="date" required className={FIELD} />
          <FieldError errors={state.fieldErrors?.startDate} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            End date <span className="font-normal text-gray-500">(optional)</span>
          </span>
          <input name="endDate" type="date" className={FIELD} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Total seats</span>
          <input
            name="seatsTotal"
            type="number"
            inputMode="numeric"
            min={1}
            required
            className={FIELD}
          />
          <FieldError errors={state.fieldErrors?.seatsTotal} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Fee (₹)</span>
          <input
            name="feeRupees"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            required
            className={FIELD}
          />
          <FieldError errors={state.fieldErrors?.feeAmount} />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">
          Schedule <span className="font-normal text-gray-500">(optional)</span>
        </span>
        <input name="scheduleText" className={FIELD} placeholder="Mon-Sat, 7:00-10:00" />
      </label>

      {state.message ? (
        <p
          role={state.status === 'error' ? 'alert' : undefined}
          className={state.status === 'error' ? 'text-sm text-red-600' : 'text-sm text-green-700'}
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="tap-target w-full rounded-lg bg-brand-500 px-5 text-base font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create batch'}
      </button>
    </form>
  )
}
