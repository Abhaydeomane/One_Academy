import { WATCHED_FIELD_LABELS, type ListingChange, type WatchedValue } from '@one/shared'

function show(value: WatchedValue): string {
  if (value === null) return '—'
  return Array.isArray(value) ? value.join(', ') || '—' : String(value)
}

/// BR-018: what a published institute changed since approval, before → after.
export function ChangesList({ changes }: { changes: ListingChange[] }) {
  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-amber-200 bg-white px-4">
      {changes.map((change) => (
        <li key={change.field} className="py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {WATCHED_FIELD_LABELS[change.field]}
          </p>
          <p className="mt-0.5 text-sm text-gray-500 line-through">{show(change.before)}</p>
          <p className="text-base text-gray-900">{show(change.after)}</p>
        </li>
      ))}
    </ul>
  )
}
