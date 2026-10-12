import { Prisma, prisma } from '@one/db'
import type { Mode } from '@one/shared'
import {
  baseJoins,
  queryCte,
  wherePredicates,
  type SearchFilters,
} from './institutes.search.repository.js'

// Aggregates that landing pages need and search does not. Named
// *.repository.ts so the R1/R3 lint rule permits the @one/db import here.
//
// These reuse search's own predicate builder rather than restating the
// filters, so the two cannot drift apart.

const PUBLISHED_INSTITUTE = Prisma.sql`
  l.vertical = 'INSTITUTE' AND l.status = 'PUBLISHED'
`

export async function findExamBySlug(
  slug: string,
): Promise<{ slug: string; label: string } | null> {
  return prisma.tag.findFirst({
    where: { slug, kind: 'EXAM' },
    select: { slug: true, label: true },
  })
}

export async function findCityBySlug(
  slug: string,
): Promise<{ slug: string; name: string; state: string } | null> {
  return prisma.city.findUnique({
    where: { slug },
    select: { slug: true, name: true, state: true },
  })
}

/// Fee range across every listing the filters match, independent of
/// pagination — a page showing 20 of 60 must still report the true floor.
export async function feeStatsForFilters(
  filters: SearchFilters,
): Promise<{ minFeeAmount: number | null; maxFeeAmount: number | null }> {
  const rows = await prisma.$queryRaw<{ min_fee: number | null; max_fee: number | null }[]>(
    Prisma.sql`
      ${queryCte(filters)}
      SELECT min(b."feeAmount") AS min_fee, max(b."feeAmount") AS max_fee
      FROM "Batch" b
      WHERE b.status = 'PUBLISHED'
        AND b."listingId" IN (
          SELECT l.id
          ${baseJoins()}
          -- WHERE, not AND: baseJoins() emits only FROM and JOINs, so an AND
          -- here would attach to the trailing LEFT JOIN's ON clause. That is
          -- valid SQL that silently stops filtering rows — no error, just
          -- wrong answers, including unpublished listings.
          WHERE ${Prisma.join(wherePredicates(filters), ' AND ')}
        )
    `,
  )

  const row = rows[0]
  return {
    minFeeAmount: row?.min_fee ?? null,
    maxFeeAmount: row?.max_fee ?? null,
  }
}

export async function citiesForExam(
  examSlug: string,
): Promise<{ slug: string; name: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ slug: string; name: string; count: bigint }[]>(
    Prisma.sql`
      SELECT c.slug, c.name, count(DISTINCT l.id) AS count
      FROM "Listing" l
      JOIN "City" c ON c.id = l."cityId"
      JOIN "ListingTag" lt ON lt."listingId" = l.id
      JOIN "Tag" t ON t.id = lt."tagId" AND t.kind = 'EXAM' AND t.slug = ${examSlug}
      WHERE ${PUBLISHED_INSTITUTE}
      GROUP BY c.slug, c.name
      ORDER BY count DESC, c.name ASC
    `,
  )

  return rows.map((row) => ({ slug: row.slug, name: row.name, count: Number(row.count) }))
}

export async function modeCountsFor(
  examSlug: string,
  citySlug: string,
): Promise<{ mode: Mode; count: number }[]> {
  const rows = await prisma.$queryRaw<{ mode: Mode; count: bigint }[]>(
    Prisma.sql`
      SELECT m::text AS mode, count(DISTINCT l.id) AS count
      FROM "Listing" l
      JOIN "City" c ON c.id = l."cityId" AND c.slug = ${citySlug}
      JOIN "InstituteProfile" p ON p."listingId" = l.id
      CROSS JOIN LATERAL unnest(p.modes) AS m
      JOIN "ListingTag" lt ON lt."listingId" = l.id
      JOIN "Tag" t ON t.id = lt."tagId" AND t.kind = 'EXAM' AND t.slug = ${examSlug}
      WHERE ${PUBLISHED_INSTITUTE}
      GROUP BY m
      ORDER BY count DESC, mode ASC
    `,
  )

  return rows.map((row) => ({ mode: row.mode, count: Number(row.count) }))
}

/// Every exam × city group with at least `minCount` published listings. Feeds
/// the sitemap, which must contain only pages we actually want indexed.
export async function indexableCombinations(
  minCount: number,
): Promise<{ examSlug: string; citySlug: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ exam_slug: string; city_slug: string; count: bigint }[]>(
    Prisma.sql`
      SELECT t.slug AS exam_slug, c.slug AS city_slug, count(DISTINCT l.id) AS count
      FROM "Listing" l
      JOIN "City" c ON c.id = l."cityId"
      JOIN "ListingTag" lt ON lt."listingId" = l.id
      JOIN "Tag" t ON t.id = lt."tagId" AND t.kind = 'EXAM'
      WHERE ${PUBLISHED_INSTITUTE}
      GROUP BY t.slug, c.slug
      HAVING count(DISTINCT l.id) >= ${minCount}
      ORDER BY count DESC, t.slug ASC, c.slug ASC
    `,
  )

  return rows.map((row) => ({
    examSlug: row.exam_slug,
    citySlug: row.city_slug,
    count: Number(row.count),
  }))
}
