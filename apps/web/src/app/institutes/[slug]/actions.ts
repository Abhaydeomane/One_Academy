'use server'

import { createEnquiryBody, enquiryCreatedResponse } from '@one/shared'
import { ApiError, apiPost } from '@/lib/api'

export type EnquiryFormState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
}

export async function submitEnquiry(
  _prevState: EnquiryFormState,
  formData: FormData,
): Promise<EnquiryFormState> {
  const optional = (key: string) => {
    const value = formData.get(key)
    return typeof value === 'string' && value.length > 0 ? value : undefined
  }

  const raw = {
    listingSlug: String(formData.get('listingSlug') ?? ''),
    name: String(formData.get('name') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    ...(optional('email') ? { email: optional('email') } : {}),
    ...(optional('message') ? { message: optional('message') } : {}),
    ...(optional('batchId') ? { batchId: optional('batchId') } : {}),
  }

  // Validated with the same schema the API enforces, so the user never waits on
  // a round trip to learn a field is malformed.
  const parsed = createEnquiryBody.safeParse(raw)
  if (!parsed.success) {
    const flattened = parsed.error.flatten()
    return {
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: flattened.fieldErrors as Record<string, string[]>,
    }
  }

  try {
    await apiPost('/api/v1/enquiries', parsed.data, enquiryCreatedResponse)
    return { status: 'success', message: 'Thanks — the institute will contact you shortly.' }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
      return { status: 'error', message: 'Too many requests. Please try again later.' }
    }
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      return { status: 'error', message: 'This institute is no longer accepting enquiries.' }
    }
    return { status: 'error', message: 'Something went wrong. Please try again.' }
  }
}
