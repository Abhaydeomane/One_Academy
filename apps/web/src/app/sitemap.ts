import type { MetadataRoute } from 'next'
import { instituteListResponse } from '@one/shared'
import { apiGet } from '@/lib/api'

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000'

// Rendered on demand rather than at build time: a build must not depend on the
// API being reachable. The underlying fetch is still cached for an hour, so
// crawlers do not cause repeated API load.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/institutes`, changeFrequency: 'daily', priority: 0.9 },
  ]

  let page = 1
  for (;;) {
    const data = await apiGet(
      `/api/v1/institutes?page=${page}&limit=50`,
      instituteListResponse,
      3600,
    )

    for (const institute of data.items) {
      entries.push({
        url: `${SITE_URL}/institutes/${institute.slug}`,
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }

    if (data.items.length === 0 || page * data.limit >= data.total) break
    page += 1
  }

  return entries
}
