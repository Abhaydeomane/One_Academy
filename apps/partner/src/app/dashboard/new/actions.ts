'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createListingBody, partnerListingDetail } from '@one/shared'
import { partnerApiSend, partnerErrorMessage } from '@/lib/api'
import type { ActionState } from '../[listingId]/actions'

export async function createListingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createListingBody.safeParse({
    name: String(formData.get('name') ?? ''),
    citySlug: String(formData.get('citySlug') ?? ''),
  })
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    }
  }

  let id: string
  try {
    id = (
      await partnerApiSend('/api/v1/partner/listings', 'POST', parsed.data, partnerListingDetail)
    ).id
  } catch (error) {
    return { status: 'error', message: partnerErrorMessage(error) }
  }
  // Outside the try: redirect() works by throwing.
  redirect(`/dashboard/${id}`)
}
