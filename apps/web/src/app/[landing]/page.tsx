import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@one/ui'
import { landingPageResponse, parseLandingPath, type LandingPageResponse } from '@one/shared'
import { apiGetOptional } from '@/lib/api'
import { formatFee, formatFeeRange } from '@/lib/format'
import { CompareBar } from '../CompareBar'
import { CompareCheckbox } from '../CompareCheckbox'
import { SiblingRail } from './SiblingRail'

export const revalidate = 300

// This route owns the root namespace: any unmatched root path reaches it and
// 404s. Static segments (/institutes, /sitemap.xml, /robots.txt) win in Next's
// precedence, but a future *dynamic* root sibling would collide with this.
type Params = Promise<{ landing: string }>

async function loadLanding(slug: string): Promise<LandingPageResponse | null> {
  // Cheap syntactic rejection before spending a request on an obvious miss.
  if (parseLandingPath(slug).length === 0) return null

  const search = new URLSearchParams({ path: `/${slug}` })
  return apiGetOptional(`/api/v1/landing?${search.toString()}`, landingPageResponse)
}

function headline(data: Pick<LandingPageResponse, 'exam' | 'city' | 'mode'>): string {
  const prefix = data.mode ? `${data.mode.charAt(0)}${data.mode.slice(1).toLowerCase()} ` : ''
  return `${prefix}${data.exam.label} Coaching in ${data.city.name}`
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { landing } = await params
  const data = await loadLanding(landing)
  if (!data) return { title: 'Page not found' }

  const count = data.listings.total
  const floor = data.feeStats.minFeeAmount
  // Degrades to nothing rather than printing "Fees from null" when the whole
  // set has no published batches.
  const fees = floor === null ? '' : ` Fees from ${formatFee(floor, 'INR')}.`

  return {
    title: headline(data),
    description:
      `Compare ${count} ${data.exam.label} coaching ${count === 1 ? 'institute' : 'institutes'}` +
      ` in ${data.city.name}.${fees} Upcoming batches, schedules and seats.`,
    alternates: { canonical: data.canonicalPath },
    // Thin pages stay reachable and keep passing equity downward, but are not
    // indexed. The threshold lives in @one/shared, not here.
    ...(data.indexable ? {} : { robots: { index: false, follow: true } }),
  }
}

export default async function LandingPage({ params }: { params: Params }) {
  const { landing } = await params
  const data = await loadLanding(landing)
  if (!data) notFound()

  const fees = formatFeeRange(data.feeStats.minFeeAmount, data.feeStats.maxFeeAmount)

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Institutes', item: '/institutes' },
        { '@type': 'ListItem', position: 2, name: headline(data), item: data.canonicalPath },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: data.listings.items.map((institute, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: institute.name,
        url: `/institutes/${institute.slug}`,
      })),
    },
  ]

  return (
    // pb-20 keeps the fixed CompareBar from covering the last rail.
    <div className="space-y-7 pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="space-y-2">
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{headline(data)}</h1>
        <p className="text-sm text-gray-600">
          {data.listings.total} {data.listings.total === 1 ? 'institute' : 'institutes'}
          {fees ? ` · ${fees}` : ''}
        </p>
      </header>

      {/* Deliberately empty: the checkboxes live in the cards below and
          associate with this form by id. */}
      <form id="compare" action="/compare" method="get" />

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.listings.items.map((institute) => {
          const instituteFees = formatFeeRange(institute.minFeeAmount, institute.maxFeeAmount)

          return (
            <li key={institute.id} className="relative">
              {/* pr-12 reserves room for the comparison checkbox, which is a
                  sibling rather than a child: inside the Link it would
                  navigate instead of toggling. */}
              <Link
                href={`/institutes/${institute.slug}`}
                className="block h-full rounded-lg border border-gray-200 bg-white p-4 pr-12 active:bg-gray-50"
              >
                <h2 className="text-base font-semibold leading-snug text-brand-700">
                  {institute.name}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {institute.locality ? `${institute.locality}, ` : ''}
                  {institute.city.name}
                </p>

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
                  {instituteFees ? (
                    <p className="text-sm font-semibold text-brand-700">{instituteFees}</p>
                  ) : null}
                </div>
              </Link>
              <CompareCheckbox slug={institute.slug} name={institute.name} />
            </li>
          )
        })}
      </ul>

      <SiblingRail
        title={`Other exams in ${data.city.name}`}
        links={data.siblings.examsInCity.map((sibling) => ({
          label: sibling.label,
          count: sibling.count,
          path: sibling.path,
        }))}
      />

      <SiblingRail
        title={`${data.exam.label} coaching in other cities`}
        links={data.siblings.citiesForExam.map((sibling) => ({
          label: sibling.name,
          count: sibling.count,
          path: sibling.path,
        }))}
      />

      <SiblingRail
        title="Narrow by mode"
        links={data.siblings.modeVariants.map((sibling) => ({
          label: sibling.mode.charAt(0) + sibling.mode.slice(1).toLowerCase(),
          count: sibling.count,
          path: sibling.path,
        }))}
      />

      <p className="pt-2 text-sm">
        <Link href="/institutes" className="text-brand-700 underline">
          Browse all institutes
        </Link>
      </p>

      <CompareBar />
    </div>
  )
}
