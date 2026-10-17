import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  buildComparePath,
  compareResponse,
  COMPARE_MAX,
  COMPARE_MIN,
  dedupeSlugs,
  parseBatchPins,
  type CompareResponse,
} from '@one/shared'
import { ApiError, apiGetOptional } from '@/lib/api'
import { CompareTable } from './CompareTable'

export const revalidate = 300

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const asArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

function queryString(slugs: string[], pins: string[]): string {
  const params = new URLSearchParams()
  for (const slug of slugs) params.append('slug', slug)
  for (const pin of pins) params.append('batch', pin)
  return params.toString()
}

async function load(slugs: string[], pins: string[]): Promise<CompareResponse | null> {
  // Cheap rejection of a URL that cannot be a comparison, before spending a
  // request on it — the same reason the landing route parses before fetching.
  const distinct = dedupeSlugs(slugs)
  if (distinct.length < COMPARE_MIN || distinct.length > COMPARE_MAX) return null

  try {
    return await apiGetOptional(`/api/v1/compare?${queryString(slugs, pins)}`, compareResponse)
  } catch (error) {
    // A 400 here means a hand-edited or tampered URL — a malformed pin, or a
    // bound this function did not catch. For a page that is "not found", not a
    // server fault, so it must not surface as a 500.
    if (error instanceof ApiError && error.status === 400) return null
    throw error
  }
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams
}): Promise<Metadata> {
  const raw = await searchParams
  const data = await load(asArray(raw.slug), asArray(raw.batch))
  if (!data) return { title: 'Compare institutes' }

  const names = data.columns.map((column) => column.institute.name)

  return {
    // The root layout's template appends " | One Academy"; adding it here too
    // would print it twice.
    title: names.join(' vs '),
    description: `Compare fees, batches, schedules and seats across ${names.join(', ')}.`,
    // The combination space is binomial, and nearly every page would be a thin
    // near-duplicate of its neighbours and of the P1b landing page for the
    // same city and exam — the doorway risk ADR 0014 exists to avoid.
    // `follow` keeps equity flowing to the institute pages.
    robots: { index: false, follow: true },
  }
}

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const slugs = asArray(raw.slug)
  const rawPins = asArray(raw.batch)

  const data = await load(slugs, rawPins)
  if (!data) notFound()

  const { pins } = parseBatchPins(rawPins)
  const canonical = data.canonicalSlugs

  // Redirect only for a *rename*, never for a drop. Comparing `canonical`
  // against every requested slug would also fire when one was dropped, which
  // would bounce to a tidier URL and silently lose the "left out" notice —
  // defeating the reason `dropped` is returned at all. So compare against the
  // slugs that survived, in order.
  const droppedSlugs = new Set(data.dropped.map((drop) => drop.slug))
  const survived = slugs.filter((slug) => !droppedSlugs.has(slug))
  const renamed = survived.some((slug, index) => slug !== canonical[index])

  // The API returns the canonical set as data rather than a 301, because fetch
  // follows redirects transparently and the browser would keep the stale URL
  // (BUG-001). A comparison URL exists to be shared, so correcting the address
  // bar is the whole point.
  if (renamed) {
    const rewritten = pins.map((pin) => {
      const index = survived.indexOf(pin.slug)
      const canonicalSlug = index === -1 ? undefined : canonical[index]
      return canonicalSlug ? { slug: canonicalSlug, batchId: pin.batchId } : pin
    })
    // A URL that was both renamed and partly dropped loses the notice on the
    // way through. Correcting a stale address is worth that once.
    redirect(buildComparePath(canonical, rewritten))
  }

  // Encoded once here so each column's picker can carry the other columns'
  // pins as hidden inputs without re-deriving the grammar.
  const encodedPins = pins.map((pin) => `${pin.slug}:${pin.batchId}`)

  return (
    <div className="space-y-5 pb-4">
      <header className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">Compare institutes</h1>
        <p className="text-sm text-gray-600">
          {data.columns.length} institutes · swipe the table sideways
        </p>
      </header>

      {data.dropped.length > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {data.dropped.map((drop) => drop.slug).join(', ')}{' '}
          {data.dropped.length === 1 ? 'is' : 'are'} no longer listed and{' '}
          {data.dropped.length === 1 ? 'was' : 'were'} left out.
        </p>
      ) : null}

      <CompareTable columns={data.columns} slugs={canonical} pins={encodedPins} />

      <p className="pt-2 text-sm">
        <Link href="/institutes" className="text-brand-700 underline">
          Back to all institutes
        </Link>
      </p>
    </div>
  )
}
