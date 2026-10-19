import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Badge } from '@one/ui'
import { batchListResponse, buildLandingPath, instituteDetail, safeHttpUrl } from '@one/shared'
import { apiGet, apiGetOptional } from '@/lib/api'
import { formatDateRange, formatFee, formatSeats } from '@/lib/format'
import { EnquiryForm } from './EnquiryForm'
import { InstituteLogo } from '../../InstituteLogo'
import { PhotoStrip } from './PhotoStrip'

export const revalidate = 300

type Params = Promise<{ slug: string }>

async function loadInstitute(slug: string) {
  return apiGetOptional(`/api/v1/institutes/${slug}`, instituteDetail)
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const institute = await loadInstitute(slug)
  if (!institute) return { title: 'Institute not found' }

  const description =
    institute.shortDescription ??
    `${institute.name} in ${institute.city.name} — batches, fees and schedules.`

  return {
    title: `${institute.name}, ${institute.city.name}`,
    description,
    alternates: { canonical: `/institutes/${institute.slug}` },
    openGraph: { title: institute.name, description, type: 'website' },
  }
}

export default async function InstituteDetailPage({ params }: { params: Params }) {
  const { slug } = await params
  const institute = await loadInstitute(slug)
  if (!institute) notFound()

  const batches = await apiGet(`/api/v1/institutes/${slug}/batches`, batchListResponse)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: institute.name,
    ...(institute.shortDescription ? { description: institute.shortDescription } : {}),
    ...(safeHttpUrl(institute.website) ? { url: safeHttpUrl(institute.website) } : {}),
    ...(institute.establishedYear ? { foundingDate: String(institute.establishedYear) } : {}),
    ...(institute.logo ? { logo: institute.logo.url } : {}),
    ...(institute.photos.length > 0 ? { image: institute.photos.map((photo) => photo.url) } : {}),
    address: {
      '@type': 'PostalAddress',
      addressLocality: institute.city.name,
      ...((institute.address ?? institute.locality)
        ? { streetAddress: institute.address ?? institute.locality }
        : {}),
    },
    ...(institute.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: institute.ratingAvg,
            reviewCount: institute.ratingCount,
          },
        }
      : {}),
  }

  return (
    <article className="space-y-7 pb-24 sm:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="space-y-2.5">
        <div className="flex items-center gap-3">
          <InstituteLogo url={institute.logo?.url ?? null} size={96} />
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{institute.name}</h1>
        </div>
        <p className="text-sm text-gray-600">
          {institute.locality ? `${institute.locality}, ` : ''}
          {institute.city.name}
        </p>
        {institute.address ? <p className="text-sm text-gray-600">{institute.address}</p> : null}
        <div className="flex flex-wrap gap-1.5">
          {institute.exams.map((exam) => (
            <Badge key={exam}>{exam.toUpperCase()}</Badge>
          ))}
          {institute.modes.map((mode) => (
            <Badge key={mode}>{mode}</Badge>
          ))}
        </div>
      </header>

      <PhotoStrip photos={institute.photos} name={institute.name} />

      {institute.about ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">About</h2>
          <p className="text-sm leading-relaxed text-gray-700">{institute.about}</p>
        </section>
      ) : null}

      {institute.establishedYear || institute.facultyCount ? (
        <section className="grid grid-cols-2 gap-3">
          {institute.establishedYear ? (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <dt className="text-xs text-gray-500">Established</dt>
              <dd className="text-base font-semibold">{institute.establishedYear}</dd>
            </div>
          ) : null}
          {institute.facultyCount ? (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <dt className="text-xs text-gray-500">Faculty</dt>
              <dd className="text-base font-semibold">{institute.facultyCount}</dd>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Upcoming batches</h2>

        {batches.items.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            No published batches right now.
          </p>
        ) : (
          <ul className="space-y-3">
            {batches.items.map((batch) => (
              <li
                key={batch.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold leading-snug">{batch.title}</h3>
                  <p className="shrink-0 text-base font-semibold text-brand-700">
                    {formatFee(batch.feeAmount, batch.feeCurrency)}
                  </p>
                </div>

                <dl className="mt-3 space-y-1.5 text-sm text-gray-700 sm:grid sm:grid-cols-2 sm:gap-x-4 sm:space-y-0">
                  <div className="flex gap-1.5">
                    <dt className="text-gray-500">Exam</dt>
                    <dd className="font-medium">{batch.exam}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-gray-500">Mode</dt>
                    <dd className="font-medium">{batch.mode}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-gray-500">Dates</dt>
                    <dd className="font-medium">
                      {formatDateRange(batch.startDate, batch.endDate)}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-gray-500">Seats</dt>
                    <dd className="font-medium">
                      {formatSeats(batch.seatsAvailable, batch.seatsTotal)}
                    </dd>
                  </div>
                </dl>

                {batch.scheduleText ? (
                  <p className="mt-2 text-sm text-gray-600">{batch.scheduleText}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {institute.exams.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Explore similar institutes</h2>
          {/* Every institute page is an entry point into the landing graph,
              which is the direction crawl budget should flow. These pages
              always exist: this institute is itself one of their listings. */}
          <div className="scroll-rail scroll-rail-hide-bar -mx-4 flex gap-2 px-4 pb-1">
            {institute.exams.map((exam) => (
              <Link
                key={exam}
                href={buildLandingPath({ examSlug: exam, citySlug: institute.city.slug })}
                className="tap-target inline-flex shrink-0 snap-start items-center rounded-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700"
              >
                {exam.toUpperCase()} coaching in {institute.city.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section id="enquire" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-semibold">Request a callback</h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <EnquiryForm
            listingSlug={institute.slug}
            batches={batches.items.map((batch) => ({ id: batch.id, title: batch.title }))}
          />
        </div>
      </section>

      {/* Mobile conversion bar: the enquiry is the goal, so it stays reachable
          without scrolling. Hidden once the form is visible beside it on sm+. */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 pt-3 backdrop-blur sm:hidden">
        <a
          href="#enquire"
          className="tap-target flex w-full items-center justify-center rounded-lg bg-brand-500 text-base font-medium text-white"
        >
          Request a callback
        </a>
      </div>
    </article>
  )
}
