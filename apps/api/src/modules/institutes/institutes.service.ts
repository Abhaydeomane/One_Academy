import type {
  BatchSummary,
  CreateBatchBody,
  InstituteDetail,
  InstituteSummary,
  ListInstitutesQuery,
  Paginated,
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

function toSummary(row: repo.InstituteRow, batchCount: number): InstituteSummary {
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
    batchCount,
  }
}

function toDetail(row: repo.InstituteRow, batchCount: number): InstituteDetail {
  return {
    ...toSummary(row, batchCount),
    about: row.instituteProfile?.about ?? null,
    website: row.instituteProfile?.website ?? null,
    establishedYear: row.instituteProfile?.establishedYear ?? null,
    facultyCount: row.instituteProfile?.facultyCount ?? null,
    media: row.media,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  }
}

export async function listPublished(
  query: ListInstitutesQuery,
): Promise<Paginated<InstituteSummary>> {
  const { rows, total } = await repo.listPublished({
    ...(query.city ? { citySlug: query.city } : {}),
    ...(query.exam ? { examSlug: query.exam } : {}),
    ...(query.mode ? { mode: query.mode } : {}),
    sort: query.sort,
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  })

  // batchCount counts published batches only, so it cannot be derived from a
  // plain relation count on the listing.
  const counts = await batches.countPublishedByListingIds(rows.map((row) => row.id))

  return {
    items: rows.map((row) => toSummary(row, counts.get(row.id) ?? 0)),
    total,
    page: query.page,
    limit: query.limit,
  }
}

export async function getPublishedBySlug(slug: string) {
  const resolved = await resolvePublishedSlug(slug)
  const row = await repo.findPublishedById(resolved.listingId)
  if (!row) throw new NotFoundError('Institute not found')

  const counts = await batches.countPublishedByListingIds([row.id])

  return {
    detail: toDetail(row, counts.get(row.id) ?? 0),
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
