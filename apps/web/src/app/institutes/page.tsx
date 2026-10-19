import Link from 'next/link'
import { Badge } from '@one/ui'
import { instituteListResponse, listInstitutesQuery, type ListInstitutesQuery } from '@one/shared'
import { apiGet } from '@/lib/api'
import { formatFeeRange } from '@/lib/format'
import { CompareBar } from '../CompareBar'
import { CompareCheckbox } from '../CompareCheckbox'
import { FilterRail } from './FilterRail'
import { SearchForm } from './SearchForm'
import { InstituteLogo } from '../InstituteLogo'

export const revalidate = 300

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const q = typeof raw.q === 'string' ? raw.q : undefined

  // A query result page must not compete with the P1b landing pages for the
  // same terms, and an unbounded query space must not be indexed. `follow`
  // keeps the link equity flowing to the institute pages.
  return q
    ? {
        title: `Search: ${q}`,
        description: `Coaching institutes matching ${q}.`,
        robots: { index: false, follow: true },
      }
    : {
        title: 'Coaching institutes',
        description: 'Browse coaching institutes with upcoming batches, fees and schedules.',
      }
}

function queryString(query: ListInstitutesQuery, page: number): string {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.city) params.set('city', query.city)
  for (const exam of query.exams ?? []) params.append('exams', exam)
  if (query.mode) params.set('mode', query.mode)
  if (query.feeMin !== undefined) params.set('feeMin', String(query.feeMin))
  if (query.feeMax !== undefined) params.set('feeMax', String(query.feeMax))
  if (query.sort) params.set('sort', query.sort)
  params.set('page', String(page))
  return params.toString()
}

/// Names the filter most likely to be responsible for an empty result, so the
/// empty state can offer to clear exactly that one rather than everything.
function narrowingFilter(query: ListInstitutesQuery): { label: string; cleared: string } | null {
  const without = (keys: string[]) => {
    const params = new URLSearchParams(queryString(query, 1))
    for (const key of keys) params.delete(key)
    return `/institutes?${params.toString()}`
  }

  if (query.feeMin !== undefined || query.feeMax !== undefined) {
    return { label: 'the fee filter', cleared: without(['feeMin', 'feeMax']) }
  }
  if (query.exams?.length) return { label: 'the exam filter', cleared: without(['exams']) }
  if (query.mode) return { label: 'the mode filter', cleared: without(['mode']) }
  if (query.city) return { label: 'the city filter', cleared: without(['city']) }
  return null
}

export default async function InstitutesPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const parsed = listInstitutesQuery.safeParse(raw)
  const query = parsed.success ? parsed.data : listInstitutesQuery.parse({})

  const data = await apiGet(
    `/api/v1/institutes?${queryString(query, query.page)}`,
    instituteListResponse,
  )

  const pageCount = Math.max(1, Math.ceil(data.total / data.limit))
  const narrowing = narrowingFilter(query)

  return (
    // pb-20 keeps the fixed CompareBar from covering the last card.
    <section className="space-y-4 pb-20">
      <div className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">
          {query.q ? `Results for "${query.q}"` : 'Coaching institutes'}
        </h1>
        <p className="text-sm text-gray-600">
          {data.total} {data.total === 1 ? 'institute' : 'institutes'}
        </p>
      </div>

      <SearchForm query={query} />

      <FilterRail query={query} facets={data.facets} />

      {/* Deliberately empty: the checkboxes live in the cards below and
          associate with this form by id, because putting them inside the
          search form would submit them to the wrong place, and nesting forms
          is invalid HTML. */}
      <form id="compare" action="/compare" method="get" />

      {data.items.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-700">
            {query.q
              ? `No institutes match "${query.q}".`
              : 'No institutes match these filters yet.'}
          </p>
          {narrowing ? (
            <Link
              href={narrowing.cleared}
              className="tap-target inline-flex items-center rounded-lg border border-brand-500 px-4 text-sm font-medium text-brand-700"
            >
              Clear {narrowing.label}
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((institute) => {
            const fees = formatFeeRange(institute.minFeeAmount, institute.maxFeeAmount)

            return (
              <li key={institute.id} className="relative">
                {/* The whole card is the tap target, not just the title.
                    pr-12 reserves room for the comparison checkbox, which is a
                    sibling rather than a child: inside the Link it would
                    navigate instead of toggling. */}
                <Link
                  href={`/institutes/${institute.slug}`}
                  className="block h-full rounded-lg border border-gray-200 bg-white p-4 pr-12 active:bg-gray-50"
                >
                  <div className="flex items-start gap-3">
                    <InstituteLogo url={institute.logoUrl} size={48} />
                    <h2 className="text-base font-semibold leading-snug text-brand-700">
                      {institute.name}
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {institute.locality ? `${institute.locality}, ` : ''}
                    {institute.city.name}
                  </p>

                  {institute.shortDescription ? (
                    <p className="mt-2 line-clamp-2 text-sm text-gray-700">
                      {institute.shortDescription}
                    </p>
                  ) : null}

                  {institute.exams.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {institute.exams.map((exam) => (
                        <Badge key={exam}>{exam.toUpperCase()}</Badge>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <p className="text-xs text-gray-500">
                      {institute.batchCount} upcoming{' '}
                      {institute.batchCount === 1 ? 'batch' : 'batches'}
                    </p>
                    {fees ? <p className="text-sm font-semibold text-brand-700">{fees}</p> : null}
                  </div>
                </Link>
                <CompareCheckbox slug={institute.slug} name={institute.name} />
              </li>
            )
          })}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav className="flex items-center justify-between gap-3 pt-2">
          {query.page > 1 ? (
            <Link
              href={`/institutes?${queryString(query, query.page - 1)}`}
              className="tap-target inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium"
            >
              Previous
            </Link>
          ) : (
            <span />
          )}

          <span className="text-sm text-gray-600">
            Page {query.page} of {pageCount}
          </span>

          {query.page < pageCount ? (
            <Link
              href={`/institutes?${queryString(query, query.page + 1)}`}
              className="tap-target inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium"
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      <CompareBar />
    </section>
  )
}
