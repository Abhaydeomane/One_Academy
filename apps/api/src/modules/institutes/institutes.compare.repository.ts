import { prisma } from '@one/db'

/// Comparison needs fewer fields than the detail page and more than the search
/// summary, so it projects its own row rather than widening either.
export type CompareRow = {
  id: string
  slug: string
  name: string
  locality: string | null
  city: { slug: string; name: string }
  instituteProfile: { establishedYear: number | null; facultyCount: number | null } | null
}

export async function findCompareRowsByIds(ids: string[]): Promise<CompareRow[]> {
  if (ids.length === 0) return []

  return prisma.listing.findMany({
    // BR-009 at the data boundary, so no caller can forget it. The vertical
    // filter is BR-008's single-vertical rule.
    where: { id: { in: ids }, status: 'PUBLISHED', vertical: 'INSTITUTE' },
    select: {
      id: true,
      slug: true,
      name: true,
      locality: true,
      city: { select: { slug: true, name: true } },
      instituteProfile: { select: { establishedYear: true, facultyCount: true } },
    },
  })
}
