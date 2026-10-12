import {
  buildLandingPath,
  LANDING_MIN_INDEXABLE,
  parseLandingPath,
  type LandingCandidate,
  type LandingPageResponse,
  type LandingQuery,
  type Mode,
} from '@one/shared'
import { NotFoundError } from '../../lib/errors.js'
import * as landingRepo from './institutes.landing.repository.js'
import { examFacets, type SearchFilters } from './institutes.search.repository.js'
import { summariesForFilters } from './institutes.service.js'

type Resolved = {
  exam: { slug: string; label: string }
  city: { slug: string; name: string; state: string }
  mode: Mode | null
}

/// Takes the parser's candidates in order and returns the first whose slugs
/// both exist. This is why resolution lives server-side: only the database can
/// say whether "online-jee" is mode ONLINE plus exam "jee", or an exam slugged
/// exactly that.
async function resolve(candidates: LandingCandidate[]): Promise<Resolved | null> {
  for (const candidate of candidates) {
    const [exam, city] = await Promise.all([
      landingRepo.findExamBySlug(candidate.examSlug),
      landingRepo.findCityBySlug(candidate.citySlug),
    ])
    if (exam && city) return { exam, city, mode: candidate.mode ?? null }
  }
  return null
}

function filtersFor(resolved: Resolved, page: number, limit: number): SearchFilters {
  return {
    citySlug: resolved.city.slug,
    examSlugs: [resolved.exam.slug],
    ...(resolved.mode ? { mode: resolved.mode } : {}),
    sort: 'recent',
    skip: (page - 1) * limit,
    take: limit,
  }
}

export async function landingPage(query: LandingQuery): Promise<LandingPageResponse> {
  const resolved = await resolve(parseLandingPath(query.path))
  if (!resolved) throw new NotFoundError('Landing page not found')

  const filters = filtersFor(resolved, query.page, query.limit)

  const [listings, feeStats, examsInCityRaw, citiesRaw, modeCounts] = await Promise.all([
    summariesForFilters(filters),
    landingRepo.feeStatsForFilters(filters),
    // examFacets omits its own filter, so this returns every exam in the city
    // — including the current one, which the mapping below removes.
    //
    // `mode: undefined` is deliberate: lateral links move along one taxonomy
    // axis at a time. With the mode kept, an exam whose only institute in this
    // city uses a different mode would silently disappear from the siblings.
    examFacets({ ...filters, mode: undefined }),
    landingRepo.citiesForExam(resolved.exam.slug),
    landingRepo.modeCountsFor(resolved.exam.slug, resolved.city.slug),
  ])

  if (listings.total === 0) throw new NotFoundError('Landing page not found')

  // The unfiltered total for this exam and city. Without a mode the page is
  // already unfiltered; with one, re-run the count. `take` must be 1, never 0
  // — searchPublished reads the total off the first returned row, so an empty
  // page would report zero.
  const parentTotal = resolved.mode
    ? (
        await summariesForFilters({
          ...filters,
          mode: undefined,
          skip: 0,
          take: 1,
        })
      ).total
    : listings.total

  const selfPath = buildLandingPath({
    examSlug: resolved.exam.slug,
    citySlug: resolved.city.slug,
    mode: resolved.mode,
  })
  const parentPath = buildLandingPath({
    examSlug: resolved.exam.slug,
    citySlug: resolved.city.slug,
  })

  // A mode-filtered set is a subset of the unfiltered one, so equal totals
  // prove equal membership: the variant is a duplicate of its parent.
  const canonicalPath = resolved.mode && listings.total === parentTotal ? parentPath : selfPath

  return {
    exam: resolved.exam,
    city: resolved.city,
    mode: resolved.mode,
    listings,
    parentTotal,
    indexable: listings.total >= LANDING_MIN_INDEXABLE,
    canonicalPath,
    feeStats,
    siblings: {
      examsInCity: examsInCityRaw
        // Exclude self, or every page links to itself.
        .filter((facet) => facet.slug !== resolved.exam.slug)
        .map((facet) => ({
          slug: facet.slug,
          label: facet.label,
          count: facet.count,
          // Lateral links ignore mode: one taxonomy axis at a time.
          path: buildLandingPath({ examSlug: facet.slug, citySlug: resolved.city.slug }),
        })),
      citiesForExam: citiesRaw
        .filter((city) => city.slug !== resolved.city.slug)
        .map((city) => ({
          slug: city.slug,
          name: city.name,
          count: city.count,
          path: buildLandingPath({ examSlug: resolved.exam.slug, citySlug: city.slug }),
        })),
      modeVariants: modeCounts
        .filter((variant) => variant.mode !== resolved.mode)
        // A variant covering the whole set would canonicalise back to this
        // page, so linking it would point at a near-duplicate.
        .filter((variant) => variant.count !== parentTotal)
        .map((variant) => ({
          mode: variant.mode,
          count: variant.count,
          path: buildLandingPath({
            examSlug: resolved.exam.slug,
            citySlug: resolved.city.slug,
            mode: variant.mode,
          }),
        })),
    },
  }
}

export async function indexablePaths(): Promise<string[]> {
  const combinations = await landingRepo.indexableCombinations(LANDING_MIN_INDEXABLE)
  return combinations.map((combination) =>
    buildLandingPath({
      examSlug: combination.examSlug,
      citySlug: combination.citySlug,
    }),
  )
}
