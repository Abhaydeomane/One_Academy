'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { adminListingSummary, rejectListingBody } from '@one/shared'
import { PartnerApiError, partnerApiSend, partnerErrorMessage } from '@/lib/api'
import type { ActionState } from '@/app/dashboard/[listingId]/actions'

async function decide(
  path: string,
  body: unknown,
  done: string,
  values?: ActionState['values'],
): Promise<ActionState> {
  try {
    await partnerApiSend(path, 'POST', body, adminListingSummary)
  } catch (error) {
    // Another tab or admin decided first. redirect() throws; nothing catches it here.
    if (error instanceof PartnerApiError && error.status === 409)
      redirect('/admin/review?done=already')
    return {
      status: 'error',
      message: partnerErrorMessage(error),
      ...(values ? { values } : {}),
    }
  }
  redirect(`/admin/review?done=${done}`)
}

export async function approveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const listingId = String(formData.get('listingId') ?? '')
  return decide(`/api/v1/admin/listings/${listingId}/publish`, {}, 'published')
}

export async function rejectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const listingId = String(formData.get('listingId') ?? '')
  const reason = String(formData.get('reason') ?? '')
  const parsed = rejectListingBody.safeParse({ reason })
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Give a reason of 10 to 500 characters.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      values: { reason },
    }
  }
  return decide(`/api/v1/admin/listings/${listingId}/reject`, parsed.data, 'rejected', { reason })
}
