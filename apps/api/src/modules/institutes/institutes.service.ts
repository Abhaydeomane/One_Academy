import type {
  BatchSummary,
  CreateBatchBody,
  InstituteDetail,
  InstituteListResponse,
  InstituteSort,
  InstituteSummary,
  ListInstitutesQuery,
  PartnerListingDetail,
  PartnerListingListResponse,
  PartnerListingSummary,
  UpdateListingBody,
} from '@one/shared'
import { NotFoundError } from '../../lib/errors.js'
import * as accounts from '../accounts/accounts.service.js'
import * as batches from '../batches/batches.service.js'
import {
  assertOrgOwnsListing,
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

  const [matched, exams, modes] = await Promise.all([
    repo.searchPublished(filters),
    repo.examFacets(filters),
    repo.modeFacets(filters),
  ])

  const rows = await repo.findSummariesByIds(matched.hits.map((hit) => hit.id))
  const byId = new Map(rows.map((row) => [row.id, row]))

  // `IN` does not preserve order, so the hit order is authoritative.
  const items = matched.hits.flatMap((hit) => {
    const row = byId.get(hit.id)
    return row ? [toSummary(row, hit)] : []
  })

  return {
    items,
    total: matched.total,
    page: query.page,
    limit: query.limit,
    facets: { exams, modes },
  }
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

function toPartnerSummary(row: repo.PartnerListingRow): PartnerListingSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    cityName: row.city.name,
    batchCount: row._count.batches,
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
  await assertOrgOwnsListing(listingId, organizationId)
  await submitForReview(listingId)
  return getForOrg(listingId, organizationId)
}

export async function updateForOrg(
  listingId: string,
  organizationId: string,
  body: UpdateListingBody,
): Promise<PartnerListingDetail> {
  await assertOrgOwnsListing(listingId, organizationId)

  await repo.updateListingAndProfile(
    listingId,
    {
      ...(body.name ? { name: body.name } : {}),
      ...(body.shortDescription === undefined ? {} : { shortDescription: body.shortDescription }),
      ...(body.locality === undefined ? {} : { locality: body.locality }),
    },
    {
      ...(body.about === undefined ? {} : { about: body.about }),
      ...(body.website === undefined ? {} : { website: body.website }),
      ...(body.establishedYear === undefined ? {} : { establishedYear: body.establishedYear }),
      ...(body.facultyCount === undefined ? {} : { facultyCount: body.facultyCount }),
      ...(body.modes === undefined ? {} : { modes: body.modes }),
    },
  )

  return getForOrg(listingId, organizationId)
}
