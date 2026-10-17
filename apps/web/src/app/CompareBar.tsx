'use client'

import { useEffect, useState } from 'react'
import { COMPARE_MAX, COMPARE_MIN } from '@one/shared'

/// The one piece of client state in the app, and it buys something specific:
/// without a live count the UI can submit a selection that is guaranteed to be
/// rejected. The checkboxes are server-rendered and still submit without this.
export function CompareBar() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    // The inputs associate with the form by id, so they are not descendants of
    // it — but form.elements still collects them, which is exactly why the
    // `form` attribute is used rather than wrapping the cards.
    const form = document.getElementById('compare')
    if (!(form instanceof HTMLFormElement)) return

    const recount = () =>
      setCount(
        [...form.elements].filter(
          (element): element is HTMLInputElement =>
            element instanceof HTMLInputElement && element.name === 'slug' && element.checked,
        ).length,
      )

    document.addEventListener('change', recount)
    recount()
    return () => document.removeEventListener('change', recount)
  }, [])

  if (count === 0) return null

  const ready = count >= COMPARE_MIN && count <= COMPARE_MAX

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 pt-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-gray-700">
          {count} selected
          {ready ? '' : ` · pick ${COMPARE_MIN}–${COMPARE_MAX}`}
        </p>
        <button
          type="submit"
          form="compare"
          disabled={!ready}
          className="tap-target inline-flex items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white disabled:bg-gray-300"
        >
          Compare
        </button>
      </div>
    </div>
  )
}
