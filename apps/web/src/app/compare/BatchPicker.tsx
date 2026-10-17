'use client'

import type { BatchSummary } from '@one/shared'

/// A `GET` form whose option values *are* the pin grammar (`slug:batchId`), so
/// picking a batch needs no URL building and no state — submitting rewrites
/// the address, and stage two of selection stays in the URL (ADR 0012).
///
/// The other columns' slugs and pins ride along as hidden inputs, the same way
/// the search form carries its active filters, so changing one column does not
/// reset the rest.
///
/// JavaScript only auto-submits on change. Without it the select still works
/// and `<noscript>` supplies the button, so nothing essential depends on this
/// component hydrating.
export function BatchPicker({
  name,
  slug,
  slugs,
  otherPins,
  batches,
  pinnedId,
}: {
  name: string
  slug: string
  slugs: string[]
  otherPins: string[]
  batches: BatchSummary[]
  pinnedId: string | null
}) {
  // One option is not a choice.
  if (batches.length < 2) return null

  return (
    <form action="/compare" method="get" className="mt-2">
      {slugs.map((entry) => (
        <input key={entry} type="hidden" name="slug" value={entry} />
      ))}
      {otherPins.map((pin) => (
        <input key={pin} type="hidden" name="batch" value={pin} />
      ))}

      <label>
        <span className="sr-only">Batch for {name}</span>
        <select
          name="batch"
          defaultValue={pinnedId ? `${slug}:${pinnedId}` : ''}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          // text-base is 16px: anything smaller makes iOS zoom the viewport on
          // focus, which on this page would hide half the table.
          className="tap-target w-full rounded-lg border border-gray-300 bg-white px-2 text-base font-normal"
        >
          {batches.map((batch) => (
            <option key={batch.id} value={`${slug}:${batch.id}`}>
              {batch.title}
            </option>
          ))}
        </select>
      </label>

      <noscript>
        <button
          type="submit"
          className="tap-target mt-1 inline-flex items-center rounded-lg border border-gray-300 px-3 text-sm"
        >
          Show
        </button>
      </noscript>
    </form>
  )
}
