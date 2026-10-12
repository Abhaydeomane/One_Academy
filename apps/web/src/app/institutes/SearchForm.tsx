import type { ListInstitutesQuery } from '@one/shared'

/// A plain GET form, so every result set is a shareable URL and the page needs
/// no client JavaScript. Active filters ride along as hidden inputs so
/// searching narrows the current view rather than silently resetting it.
export function SearchForm({ query }: { query: ListInstitutesQuery }) {
  return (
    <form action="/institutes" method="get" className="flex gap-2">
      {query.city ? <input type="hidden" name="city" value={query.city} /> : null}
      {query.mode ? <input type="hidden" name="mode" value={query.mode} /> : null}
      {query.exams?.map((exam) => (
        <input key={exam} type="hidden" name="exams" value={exam} />
      ))}
      {query.feeMin === undefined ? null : (
        <input type="hidden" name="feeMin" value={query.feeMin} />
      )}
      {query.feeMax === undefined ? null : (
        <input type="hidden" name="feeMax" value={query.feeMax} />
      )}

      <input
        type="search"
        name="q"
        defaultValue={query.q ?? ''}
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Institute, locality or exam"
        aria-label="Search institutes"
        className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      <button
        type="submit"
        className="tap-target shrink-0 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white"
      >
        Search
      </button>
    </form>
  )
}
