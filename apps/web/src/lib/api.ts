import { errorEnvelope, type ErrorCode } from '@one/shared'
import type { ZodType } from 'zod'

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000'

/// How long a public API response stays cached, in seconds. Configurable
/// because the end-to-end suite seeds different data behind the same URLs, so
/// any caching there makes assertions depend on run order. Set to 0 in
/// e2e/playwright.config.ts.
const DEFAULT_TTL = Number(process.env.API_CACHE_TTL ?? '300')

/// Every public API response is cached under this one tag. The API expires it
/// through /api/revalidate after any change to what the public sees (ADR 0018);
/// one tag rather than per-listing tags, because a suspension also changes
/// search, landing pages, comparisons and the sitemap.
export const PUBLIC_CACHE_TAG = 'listings'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'UNKNOWN',
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const parsed = errorEnvelope.safeParse(await response.json())
    if (parsed.success) {
      return new ApiError(response.status, parsed.data.error.code, parsed.data.error.message)
    }
  } catch {
    // Non-JSON body; fall through to the generic error.
  }
  return new ApiError(response.status, 'UNKNOWN', `Request failed with ${response.status}`)
}

// Every response is parsed with the shared schema, so a contract violation
// fails loudly here instead of surfacing as `undefined` inside a component.
export async function apiGet<T>(
  path: string,
  schema: ZodType<T>,
  revalidate = DEFAULT_TTL,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: 'application/json' },
    next: { revalidate, tags: [PUBLIC_CACHE_TAG] },
  })
  if (!response.ok) throw await toApiError(response)
  return schema.parse(await response.json())
}

export async function apiGetOptional<T>(
  path: string,
  schema: ZodType<T>,
  revalidate = DEFAULT_TTL,
): Promise<T | null> {
  try {
    return await apiGet(path, schema, revalidate)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function apiPost<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!response.ok) throw await toApiError(response)
  return schema.parse(await response.json())
}
