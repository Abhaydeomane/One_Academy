import { timingSafeEqual } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { PUBLIC_CACHE_TAG } from '../../../lib/api'

// Called by the API after a moderation change so the next visitor sees it
// (REQ-002, ADR 0018). Only the API knows the secret; anyone else could use
// this to defeat the cache.

function authorised(given: string | null): boolean {
  const expected = process.env.REVALIDATE_SECRET
  if (!expected || given === null) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request): Promise<Response> {
  if (!authorised(request.headers.get('x-revalidate-secret'))) {
    return Response.json({ revalidated: false }, { status: 401 })
  }
  // `expire: 0`, not the recommended 'max': 'max' serves the stale page once
  // more, and a suspended listing must not be shown again.
  revalidateTag(PUBLIC_CACHE_TAG, { expire: 0 })
  return Response.json({ revalidated: true })
}
