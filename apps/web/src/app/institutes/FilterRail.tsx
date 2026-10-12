import Link from 'next/link'
import type { ReactNode } from 'react'
import { FEE_BUCKETS, SORT_OPTIONS, type FacetCounts, type ListInstitutesQuery } from '@one/shared'

const SORT_LABELS: Record<(typeof SORT_OPTIONS)[number], string> = {
  relevance: 'Best match',
  recent: 'Newest',
  fee_asc: 'Lowest fee',
  name: 'A–Z',
}

/// Builds a URL from the current query plus a patch. Paging always resets,
/// because page 3 of a different filter set is meaningless.
function hrefWith(
  query: ListInstitutesQuery,
  patch: Record<string, string | string[] | undefined>,
): string {
  const merged: Record<string, string | string[] | undefined> = {
    q: query.q,
    city: query.city,
    exams: query.exams,
    mode: query.mode,
    feeMin: query.feeMin === undefined ? undefined : String(query.feeMin),
    feeMax: query.feeMax === undefined ? undefined : String(query.feeMax),
    sort: query.sort,
    ...patch,
  }

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry)
    } else if (value !== '') {
      params.set(key, value)
    }
  }

  const search = params.toString()
  return search ? `/institutes?${search}` : '/institutes'
}

function Chip({
  active,
  href,
  label,
  count,
}: {
  active: boolean
  href: string
  label: string
  count?: number
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={active}
      className={[
        'tap-target inline-flex shrink-0 snap-start items-center gap-1 rounded-full border px-4 text-sm font-medium',
        active
          ? 'border-brand-500 bg-brand-500 text-white'
          : 'border-gray-300 bg-white text-gray-700',
      ].join(' ')}
    >
      <span>{label}</span>
      {count === undefined ? null : (
        <span className={active ? 'text-brand-50' : 'text-gray-500'}>({count})</span>
      )}
      {active ? <span aria-hidden="true">×</span> : null}
    </Link>
  )
}

function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="scroll-rail scroll-rail-hide-bar -mx-4 flex gap-2 px-4 pb-1">{children}</div>
  )
}

export function FilterRail({ query, facets }: { query: ListInstitutesQuery; facets: FacetCounts }) {
  const activeExams = query.exams ?? []
  const activeBucket = FEE_BUCKETS.find(
    (bucket) => bucket.feeMin === query.feeMin && bucket.feeMax === query.feeMax,
  )
  const activeSort = query.sort ?? (query.q ? 'relevance' : 'recent')

  return (
    <div className="space-y-2">
      {facets.exams.length > 0 ? (
        <Rail>
          {facets.exams.map((facet) => {
            const active = activeExams.includes(facet.slug)
            // Tapping toggles rather than replaces, so multi-select works.
            const next = active
              ? activeExams.filter((slug) => slug !== facet.slug)
              : [...activeExams, facet.slug]

            return (
              <Chip
                key={facet.slug}
                label={facet.label}
                count={facet.count}
                active={active}
                href={hrefWith(query, {
                  exams: next.length > 0 ? next : undefined,
                  page: undefined,
                })}
              />
            )
          })}
        </Rail>
      ) : null}

      {facets.modes.length > 0 ? (
        <Rail>
          {facets.modes.map((facet) => (
            <Chip
              key={facet.mode}
              label={facet.mode.charAt(0) + facet.mode.slice(1).toLowerCase()}
              count={facet.count}
              active={query.mode === facet.mode}
              href={hrefWith(query, {
                mode: query.mode === facet.mode ? undefined : facet.mode,
                page: undefined,
              })}
            />
          ))}
        </Rail>
      ) : null}

      <Rail>
        {FEE_BUCKETS.map((bucket) => {
          const active = activeBucket?.id === bucket.id
          return (
            <Chip
              key={bucket.id}
              label={bucket.label}
              active={active}
              href={hrefWith(query, {
                feeMin: active || bucket.feeMin === undefined ? undefined : String(bucket.feeMin),
                feeMax: active || bucket.feeMax === undefined ? undefined : String(bucket.feeMax),
                page: undefined,
              })}
            />
          )
        })}
      </Rail>

      <Rail>
        {SORT_OPTIONS.filter((option) => option !== 'relevance' || Boolean(query.q)).map(
          (option) => (
            <Chip
              key={option}
              label={SORT_LABELS[option]}
              active={activeSort === option}
              href={hrefWith(query, { sort: option, page: undefined })}
            />
          ),
        )}
      </Rail>
    </div>
  )
}
