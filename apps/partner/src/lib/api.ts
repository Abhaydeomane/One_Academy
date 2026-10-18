import { auth } from '@clerk/nextjs/server'
import { errorEnvelope, type ErrorCode } from '@one/shared'
import type { ZodType } from 'zod'

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000'

export class PartnerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'UNKNOWN',
    message: string,
  ) {
    super(message)
    this.name = 'PartnerApiError'
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { getToken } = await auth()
  const token = await getToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}

async function toError(response: Response): Promise<PartnerApiError> {
  try {
    const parsed = errorEnvelope.safeParse(await response.json())
    if (parsed.success) {
      return new PartnerApiError(response.status, parsed.data.error.code, parsed.data.error.message)
    }
  } catch {
    // Non-JSON body; fall through.
  }
  return new PartnerApiError(response.status, 'UNKNOWN', `Request failed with ${response.status}`)
}

// Organisation-scoped data must never come from a shared cache, hence
// no-store on every call.
export async function partnerApiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: 'application/json', ...(await authHeaders()) },
    cache: 'no-store',
  })
  if (!response.ok) throw await toError(response)
  return schema.parse(await response.json())
}

export async function partnerApiSend<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  schema: ZodType<T>,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!response.ok) throw await toError(response)
  return schema.parse(await response.json())
}

/// Maps API error codes to partner-facing copy. Every business rule the API can
/// reject with gets an explanation rather than a generic failure.
export function partnerErrorMessage(error: unknown): string {
  if (!(error instanceof PartnerApiError)) return 'Something went wrong. Please try again.'

  switch (error.code) {
    case 'BATCH_START_DATE_PAST':
      return 'A batch starting in the past cannot be published.'
    case 'BATCH_PARENT_NOT_PUBLISHED':
      return 'Your listing must be published before you can publish a batch.'
    case 'SEATS_OUT_OF_RANGE':
      return 'Seats available must be between zero and the total seats.'
    case 'INVALID_STATUS_TRANSITION':
      return 'This listing cannot be submitted in its current state.'
    case 'SLUG_IMMUTABLE':
      return 'A published listing address cannot be changed.'
    case 'FORBIDDEN':
      return 'You do not have permission to change this listing.'
    case 'LISTING_INCOMPLETE':
      return 'Fill in the remaining details before submitting.'
    case 'CITY_IMMUTABLE':
      return "A published listing's city cannot be changed."
    case 'UPSTREAM_UNAVAILABLE':
      return "We couldn't set up your institute. Please try again."
    case 'VALIDATION_FAILED':
      return 'Please check the values you entered.'
    default:
      return error.message
  }
}
