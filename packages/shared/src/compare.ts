/// BR-008: comparison accepts 2-4 listings of one vertical. Two columns fit a
/// phone; four is the point past which the table stops being readable.
export const COMPARE_MIN = 2
export const COMPARE_MAX = 4

export type BatchPin = { slug: string; batchId: string }

/// A pin names which batch a column shows: `slug:batchId`. Explicit pairs
/// rather than a positional `batches=b1,b2` list, because positional alignment
/// corrupts silently the moment slug order changes or one pin is absent, and
/// produces a page that is confidently wrong.
export function parseBatchPins(raw: string[] | undefined): {
  pins: BatchPin[]
  invalid: string[]
} {
  const bySlug = new Map<string, BatchPin>()
  const invalid: string[] = []

  for (const entry of raw ?? []) {
    const separator = entry.indexOf(':')
    // Slugs cannot contain a colon and batch ids are opaque, so the first
    // colon is the only safe split point.
    const slug = separator === -1 ? '' : entry.slice(0, separator)
    const batchId = separator === -1 ? '' : entry.slice(separator + 1)

    if (!slug || !batchId) {
      invalid.push(entry)
      continue
    }
    // Last pin wins: the column selector appends rather than replaces, so a
    // student re-picking a batch must not accumulate two pins for one column.
    bySlug.set(slug, { slug, batchId })
  }

  return { pins: [...bySlug.values()], invalid }
}

export function dedupeSlugs(raw: string[]): string[] {
  return [...new Set(raw.filter((slug) => slug.length > 0))]
}

/// Repeated `slug` params, because that is exactly what a checkbox named
/// `slug` emits — stage one of selection needs no JavaScript.
export function buildComparePath(slugs: string[], pins: BatchPin[]): string {
  const params = new URLSearchParams()
  const selected = dedupeSlugs(slugs)

  for (const slug of selected) params.append('slug', slug)
  for (const pin of pins) {
    // A pin for a slug that is no longer selected is meaningless, and carrying
    // it would leak pins for columns the student just removed.
    if (selected.includes(pin.slug)) params.append('batch', `${pin.slug}:${pin.batchId}`)
  }

  return `/compare?${params.toString()}`
}
