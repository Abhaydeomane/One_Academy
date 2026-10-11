import Link from 'next/link'
import { Badge } from '@one/ui'
import { instituteListResponse, listInstitutesQuery } from '@one/shared'
import { apiGet } from '@/lib/api'
import { FilterRail } from './FilterRail'

export const revalidate = 300

export const metadata = {
  title: 'Coaching institutes',
  description: 'Browse coaching institutes with upcoming batches, fees and schedules.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function InstitutesPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const parsed = listInstitutesQuery.safeParse(raw)
  const query = parsed.success ? parsed.data : listInstitutesQuery.parse({})

  const search = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
    sort: query.sort,
  })
  if (query.city) search.set('city', query.city)
  if (query.exam) search.set('exam', query.exam)
  if (query.mode) search.set('mode', query.mode)

  const data = await apiGet(`/api/v1/institutes?${search.toString()}`, instituteListResponse)

  const pageCount = Math.max(1, Math.ceil(data.total / data.limit))

  function pageHref(page: number) {
    const next = new URLSearchParams(search)
    next.set('page', String(page))
    return `/institutes?${next.toString()}`
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">Coaching institutes</h1>
        <p className="text-sm text-gray-600">
          {data.total} {data.total === 1 ? 'institute' : 'institutes'}
        </p>
      </div>

      <FilterRail
        current={{
          ...(query.city ? { city: query.city } : {}),
          ...(query.exam ? { exam: query.exam } : {}),
          ...(query.mode ? { mode: query.mode } : {}),
        }}
      />

      {data.items.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-600">
          No institutes match these filters yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((institute) => (
            <li key={institute.id}>
              {/* The whole card is the tap target, not just the title. */}
              <Link
                href={`/institutes/${institute.slug}`}
                className="block h-full rounded-lg border border-gray-200 bg-white p-4 active:bg-gray-50"
              >
                <h2 className="text-base font-semibold leading-snug text-brand-700">
                  {institute.name}
                </h2>
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

                <p className="mt-3 text-xs text-gray-500">
                  {institute.batchCount} upcoming {institute.batchCount === 1 ? 'batch' : 'batches'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav className="flex items-center justify-between gap-3 pt-2">
          {query.page > 1 ? (
            <Link
              href={pageHref(query.page - 1)}
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
              href={pageHref(query.page + 1)}
              className="tap-target inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium"
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  )
}
