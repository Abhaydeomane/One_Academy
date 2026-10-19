'use client'

import { useActionState } from 'react'
import type { ActionState } from './actions'

const INITIAL: ActionState = { status: 'idle' }

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>

/// A form-wrapped server action with inline feedback. Server actions need a
/// form rather than an onClick, and the result has to be visible where the
/// partner tapped.
export function ActionButton({
  action,
  label,
  pendingLabel,
  hidden,
  variant = 'secondary',
  confirm,
}: {
  action: Action
  label: string
  pendingLabel: string
  hidden: Record<string, string>
  variant?: 'primary' | 'secondary'
  /** Asked before submitting; cancelling sends nothing. */
  confirm?: string
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL)

  const className =
    variant === 'primary'
      ? 'tap-target w-full rounded-lg bg-brand-500 px-4 text-sm font-medium text-white sm:w-auto'
      : 'tap-target w-full rounded-lg border border-brand-500 px-4 text-sm font-medium text-brand-700 sm:w-auto'

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault()
      }}
      className="space-y-2"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
        {pending ? pendingLabel : label}
      </button>

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
