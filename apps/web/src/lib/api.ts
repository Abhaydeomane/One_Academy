import { errorEnvelope, type ErrorCode } from '@one/shared'
import type { ZodType } from 'zod'

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000'

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
export async function apiGet<T>(path: string, schema: ZodType<T>, revalidate = 300): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: 'application/json' },
    next: { revalidate },
  })
  if (!response.ok) throw await toApiError(response)
  return schema.parse(await response.json())
}

export async function apiGetOptional<T>(
  path: string,
  schema: ZodType<T>,
  revalidate = 300,
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
