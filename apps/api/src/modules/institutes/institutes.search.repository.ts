import { Prisma, prisma } from '@one/db'
import type { InstituteSort, Mode } from '@one/shared'

// The only hand-written SQL in the codebase. Full-text search cannot be
// expressed through Prisma's query API, so it is isolated here and kept to
// three queries: matching, exam facets, mode facets.
//
// Named *.repository.ts so the R1/R3 lint rule still allows the @one/db import
// here and keeps rejecting it everywhere else.
//
// Every value is interpolated through Prisma.sql, which parameterises it.
// Never build a fragment by concatenating a string that came from a request.

export type SearchFilters = {
  q?: string
  citySlug?: string
  examSlugs?: string[]
  mode?: Mode
  feeMin?: number
  feeMax?: number
  sort: InstituteSort
  skip: number
  take: number
}

export type SearchHit = {
  id: string
  minFeeAmount: number | null
  maxFeeAmount: number | null
  publishedBatchCount: number
}

/// Largest value a Postgres `integer` holds; stands in for "no upper bound".
const INT4_MAX = 2_147_483_647

type Omitted = 'exams' | 'mode' | null

function wherePredicates(filters: SearchFilters, omit: Omitted = null): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [
    Prisma.sql`l.vertical = 'INSTITUTE'`,
    // BR-009 applied at the data boundary, so no caller can forget it.
    Prisma.sql`l.status = 'PUBLISHED'`,
  ]

  if (filters.q) parts.push(Prisma.sql`l."searchVector" @@ q.tsq`)

  if (filters.citySlug) parts.push(Prisma.sql`c.slug = ${filters.citySlug}`)

  if (omit !== 'exams' && filters.examSlugs?.length) {
    parts.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "ListingTag" lt
      JOIN "Tag" t ON t.id = lt."tagId"
      WHERE lt."listingId" = l.id
        AND t.kind = 'EXAM'
        AND t.slug IN (${Prisma.join(filters.examSlugs)})
    )`)
  }

  if (omit !== 'mode' && filters.mode) {
    // Compared as text[] so the parameter needs no cast to the Mode enum.
    parts.push(Prisma.sql`p.modes::text[] @> ARRAY[${filters.mode}]`)
  }

  if (filters.feeMin !== undefined || filters.feeMax !== undefined) {
    // EXISTS over individual batches, NOT a comparison against the min/max
    // aggregate. The aggregate would test whether the listing's fee interval
    // overlaps the range, which is a different and wrong question: a listing
    // with batches at 25,00,000 and 1,00,00,000 paise would match a filter for
    // 40,00,000-50,00,000 despite having nothing in that band.
    parts.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "Batch" b
      WHERE b."listingId" = l.id
        AND b.status = 'PUBLISHED'
        AND b."feeAmount" BETWEEN ${filters.feeMin ?? 0} AND ${filters.feeMax ?? INT4_MAX}
    )`)
  }

  return parts
}

function queryCte(filters: SearchFilters): Prisma.Sql {
  return Prisma.sql`WITH q AS (
    SELECT websearch_to_tsquery('english', ${filters.q ?? ''}) AS tsq
  )`
}

/// City is an inner join because every listing has one; InstituteProfile is a
/// left join so a listing missing its profile row still appears rather than
/// vanishing from search.
function baseJoins(): Prisma.Sql {
  return Prisma.sql`
    FROM "Listing" l
    CROSS JOIN q
    JOIN "City" c ON c.id = l."cityId"
    LEFT JOIN "InstituteProfile" p ON p."listingId" = l.id
  `
}

const ORDER_BY: Record<InstituteSort, Prisma.Sql> = {
  relevance: Prisma.sql`rank DESC, l."publishedAt" DESC NULLS LAST`,
  recent: Prisma.sql`l."publishedAt" DESC NULLS LAST`,
  fee_asc: Prisma.sql`f.min_fee ASC NULLS LAST`,
  name: Prisma.sql`l.name ASC`,
}

type SearchRow = {
  id: string
  rank: number
  min_fee: number | null
  max_fee: number | null
  published_batches: bigint
  total: bigint
}

export async function searchPublished(
  filters: SearchFilters,
): Promise<{ hits: SearchHit[]; total: number }> {
  const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    ${queryCte(filters)}
    SELECT
      l.id,
      CASE WHEN ${filters.q ?? ''} = '' THEN 0 ELSE ts_rank(l."searchVector", q.tsq) END AS rank,
      f.min_fee,
      f.max_fee,
      f.published_batches,
      count(*) OVER () AS total
    ${baseJoins()}
    LEFT JOIN LATERAL (
      SELECT
        min(b."feeAmount") AS min_fee,
        max(b."feeAmount") AS max_fee,
        count(*) AS published_batches
      FROM "Batch" b
      WHERE b."listingId" = l.id AND b.status = 'PUBLISHED'
    ) f ON true
    WHERE ${Prisma.join(wherePredicates(filters), ' AND ')}
    ORDER BY ${ORDER_BY[filters.sort]}
    LIMIT ${filters.take} OFFSET ${filters.skip}
  `)

  return {
    // count() returns bigint; convert before these values meet a Zod schema.
    total: rows.length > 0 ? Number(rows[0]!.total) : 0,
    hits: rows.map((row) => ({
      id: row.id,
      minFeeAmount: row.min_fee,
      maxFeeAmount: row.max_fee,
      publishedBatchCount: Number(row.published_batches),
    })),
  }
}

export async function examFacets(
  filters: SearchFilters,
): Promise<{ slug: string; label: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ slug: string; label: string; count: bigint }[]>(
    Prisma.sql`
      ${queryCte(filters)}
      SELECT t.slug, t.label, count(DISTINCT l.id) AS count
      ${baseJoins()}
      JOIN "ListingTag" lt ON lt."listingId" = l.id
      JOIN "Tag" t ON t.id = lt."tagId" AND t.kind = 'EXAM'
      WHERE ${Prisma.join(wherePredicates(filters, 'exams'), ' AND ')}
      GROUP BY t.slug, t.label
      ORDER BY count DESC, t.label ASC
    `,
  )

  return rows.map((row) => ({ slug: row.slug, label: row.label, count: Number(row.count) }))
}

export async function modeFacets(filters: SearchFilters): Promise<{ mode: Mode; count: number }[]> {
  const rows = await prisma.$queryRaw<{ mode: Mode; count: bigint }[]>(
    Prisma.sql`
      ${queryCte(filters)}
      SELECT m::text AS mode, count(DISTINCT l.id) AS count
      ${baseJoins()}
      CROSS JOIN LATERAL unnest(coalesce(p.modes, ARRAY[]::"Mode"[])) AS m
      WHERE ${Prisma.join(wherePredicates(filters, 'mode'), ' AND ')}
      GROUP BY m
      ORDER BY count DESC, mode ASC
    `,
  )

  return rows.map((row) => ({ mode: row.mode, count: Number(row.count) }))
}
