import { missingForSubmission } from '@one/shared'
import type {
  BatchSummary,
  CreateBatchBody,
  CreateListingBody,
  InstituteDetail,
  InstituteListResponse,
  InstituteSort,
  InstituteSummary,
  ListInstitutesQuery,
  Paginated,
  PartnerReferenceResponse,
  PartnerListingDetail,
  PartnerListingListResponse,
  PartnerListingSummary,
  UpdateListingBody,
} from '@one/shared'
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors.js'
import { slugify } from '../../lib/slug.js'
import * as accounts from '../accounts/accounts.service.js'
import * as batches from '../batches/batches.service.js'
import {
  assertOrgOwnsListing,
  isSlugTaken,
  resolvePublishedSlug,
  submitForReview,
} from '../listings/listings.service.js'
import * as repo from './institutes.repository.js'

/// The fee range and published-batch count that both the list and the detail
/// payload need. The search query computes these as part of its own SQL; the
/// single-listing case gets them from the batches service.
type FeeSummary = {
  minFeeAmount: number | null
  maxFeeAmount: number | null
  publishedBatchCount: number
}

function toSummary(row: repo.InstituteRow, fees: FeeSummary): InstituteSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    locality: row.locality,
    shortDescription: row.shortDescription,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    modes: row.instituteProfile?.modes ?? [],
    exams: row.tags.filter((entry) => entry.tag.kind === 'EXAM').map((entry) => entry.tag.slug),
    batchCount: fees.publishedBatchCount,
    minFeeAmount: fees.minFeeAmount,
    maxFeeAmount: fees.maxFeeAmount,
  }
}

function toDetail(row: repo.InstituteRow, fees: FeeSummary): InstituteDetail {
  return {
    ...toSummary(row, fees),
    address: row.address,
    about: row.instituteProfile?.about ?? null,
    website: row.instituteProfile?.website ?? null,
    establishedYear: row.instituteProfile?.establishedYear ?? null,
    facultyCount: row.instituteProfile?.facultyCount ?? null,
    media: row.media,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  }
}

/// Relevance is meaningless without a query, so the default depends on it.
function resolveSort(query: ListInstitutesQuery): InstituteSort {
  if (query.sort) return query.sort
  return query.q ? 'relevance' : 'recent'
}

/// Runs the search and projects the matched rows through the typed SELECT,
/// restoring the rank order that `IN` does not preserve. Shared by the list
/// endpoint and the landing endpoint so the two cannot diverge.
export async function summariesForFilters(
  filters: repo.SearchFilters,
): Promise<Paginated<InstituteSummary>> {
  const matched = await repo.searchPublished(filters)
  const rows = await repo.findSummariesByIds(matched.hits.map((hit) => hit.id))
  const byId = new Map(rows.map((row) => [row.id, row]))

  const items = matched.hits.flatMap((hit) => {
    const row = byId.get(hit.id)
    return row ? [toSummary(row, hit)] : []
  })

  return {
    items,
    total: matched.total,
    page: Math.floor(filters.skip / filters.take) + 1,
    limit: filters.take,
  }
}

export async function listPublished(query: ListInstitutesQuery): Promise<InstituteListResponse> {
  const filters: repo.SearchFilters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.city ? { citySlug: query.city } : {}),
    ...(query.exams?.length ? { examSlugs: query.exams } : {}),
    ...(query.mode ? { mode: query.mode } : {}),
    ...(query.feeMin === undefined ? {} : { feeMin: query.feeMin }),
    ...(query.feeMax === undefined ? {} : { feeMax: query.feeMax }),
    sort: resolveSort(query),
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  }

  const [listings, exams, modes] = await Promise.all([
    summariesForFilters(filters),
    repo.examFacets(filters),
    repo.modeFacets(filters),
  ])

  return { ...listings, facets: { exams, modes } }
}

export async function getPublishedBySlug(slug: string) {
  const resolved = await resolvePublishedSlug(slug)
  const row = await repo.findPublishedById(resolved.listingId)
  if (!row) throw new NotFoundError('Institute not found')

  const fees = await batches.feeSummaryForListing(row.id)

  return {
    detail: toDetail(row, fees),
    canonicalSlug: resolved.canonicalSlug,
    redirected: resolved.redirected,
  }
}

/// Routes may only call their own module's service (R4), so the public batches
/// endpoint is served from here rather than importing the batches module.
export async function listPublishedBatchesBySlug(slug: string): Promise<BatchSummary[]> {
  const resolved = await resolvePublishedSlug(slug)
  return batches.listPublishedForListing(resolved.listingId)
}

// --- Partner-facing reads and writes ---------------------------------------

const examSlugs = (tags: { tag: { slug: string; kind: string } }[]) =>
  tags.filter((entry) => entry.tag.kind === 'EXAM').map((entry) => entry.tag.slug)

function toPartnerSummary(row: repo.PartnerListingRow): PartnerListingSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    cityName: row.city.name,
    batchCount: row._count.batches,
    rejectionReason: row.rejectionReason,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listForOrg(organizationId: string): Promise<PartnerListingListResponse> {
  const rows = await repo.listByOrg(organizationId)
  return { items: rows.map(toPartnerSummary) }
}

export async function getForOrg(
  listingId: string,
  organizationId: string,
): Promise<PartnerListingDetail> {
  await assertOrgOwnsListing(listingId, organizationId)
  const row = await repo.findByIdForPartner(listingId)
  if (!row) throw new NotFoundError('Listing not found')

  return {
    ...toPartnerSummary(row),
    citySlug: row.city.slug,
    locality: row.locality,
    address: row.address,
    contactPhone: row.contactPhone,
    exams: examSlugs(row.tags),
    shortDescription: row.shortDescription,
    about: row.instituteProfile?.about ?? null,
    website: row.instituteProfile?.website ?? null,
    batches: await batches.listAllForListing(listingId),
  }
}

/// Routes receive a Clerk organisation id; everything below the route works in
/// local Organization ids. R4 keeps the route out of the accounts module, so
/// the translation is exposed here.
export async function resolveOrganizationId(clerkOrgId: string): Promise<string> {
  return accounts.resolveLocalOrgId(clerkOrgId)
}

export async function createBatchForOrg(
  listingId: string,
  organizationId: string,
  body: CreateBatchBody,
): Promise<BatchSummary> {
  return batches.createForOrg(listingId, organizationId, body)
}

export async function submitForReviewForOrg(
  listingId: string,
  organizationId: string,
): Promise<PartnerListingDetail> {
  const current = await getForOrg(listingId, organizationId)
  // A non-draft listing is rejected by the status transition, not the gate.
  const missing =
    current.status !== 'DRAFT'
      ? []
      : missingForSubmission({
          name: current.name,
          cityName: current.cityName,
          address: current.address,
          contactPhone: current.contactPhone,
          exams: current.exams,
        })
  if (missing.length > 0) {
    throw new ConflictError(
      'LISTING_INCOMPLETE',
      'Add the missing details before submitting for review',
      { missing },
    )
  }
  await submitForReview(listingId)
  return getForOrg(listingId, organizationId)
}

export async function updateForOrg(
  listingId: string,
  organizationId: string,
  body: UpdateListingBody,
): Promise<PartnerListingDetail> {
  await assertOrgOwnsListing(listingId, organizationId)
  const current = await repo.findByIdForPartner(listingId)
  if (!current) throw new NotFoundError('Listing not found')

  let cityId: string | undefined
  let slug: string | undefined
  if (body.citySlug !== undefined && body.citySlug !== current.city.slug) {
    if (current.status !== 'DRAFT') {
      throw new ConflictError(
        'CITY_IMMUTABLE',
        'A listing city can only change while it is a draft',
      )
    }
    const city = await repo.findCityBySlug(body.citySlug)
    if (!city) {
      throw new BadRequestError('Unknown city', { fieldErrors: { citySlug: ['Unknown city'] } })
    }
    cityId = city.id
    // The slug embeds the city. City changes are DRAFT-only, and a draft has
    // never been public, so the slug is regenerated rather than redirected
    // (BR-002 freezes slugs from publication). It is written in the same
    // transaction as cityId, after all validation.
    slug = await availableListingSlug(slugify(`${body.name ?? current.name} ${city.slug}`))
  }

  let examTagIds: string[] | undefined
  if (body.examSlugs) {
    const wanted = [...new Set(body.examSlugs)]
    const tags = await repo.findExamTagIds(wanted)
    if (tags.length !== wanted.length) {
      throw new BadRequestError('Unknown exam', { fieldErrors: { examSlugs: ['Unknown exam'] } })
    }
    examTagIds = tags.map((tag) => tag.id)
  }

  await repo.updateListingAndProfile(
    listingId,
    {
      ...(body.name ? { name: body.name } : {}),
      ...(body.shortDescription === undefined ? {} : { shortDescription: body.shortDescription }),
      ...(body.locality === undefined ? {} : { locality: body.locality }),
      ...(body.address === undefined ? {} : { address: body.address }),
      ...(body.contactPhone === undefined ? {} : { contactPhone: body.contactPhone }),
      ...(cityId ? { cityId } : {}),
      ...(slug ? { slug } : {}),
    },
    {
      ...(body.about === undefined ? {} : { about: body.about }),
      ...(body.website === undefined ? {} : { website: body.website }),
      ...(body.establishedYear === undefined ? {} : { establishedYear: body.establishedYear }),
      ...(body.facultyCount === undefined ? {} : { facultyCount: body.facultyCount }),
      ...(body.modes === undefined ? {} : { modes: body.modes }),
    },
    examTagIds,
  )

  return getForOrg(listingId, organizationId)
}

export async function referenceData(): Promise<PartnerReferenceResponse> {
  const [cities, exams] = await Promise.all([repo.listCities(), repo.listExamTags()])
  return { cities, exams }
}

const MAX_SLUG_ATTEMPTS = 100

async function availableListingSlug(base: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`
    if (!(await isSlugTaken(candidate))) return candidate
  }
  throw new ConflictError('CONFLICT', 'Could not allocate a listing address')
}

/// BR-011: always a DRAFT, always under the session's organisation.
export async function createForOrg(
  organizationId: string,
  body: CreateListingBody,
): Promise<PartnerListingDetail> {
  const city = await repo.findCityBySlug(body.citySlug)
  if (!city) {
    throw new BadRequestError('Unknown city', { fieldErrors: { citySlug: ['Unknown city'] } })
  }
  // The city slug alone is always non-empty, so a non-Latin name still yields
  // a usable address.
  const slug = await availableListingSlug(slugify(`${body.name} ${city.slug}`))
  const id = await repo.createDraftListing({
    organizationId,
    cityId: city.id,
    name: body.name,
    slug,
  })
  return getForOrg(id, organizationId)
}
