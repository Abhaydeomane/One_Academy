'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  adminDecisionResponse,
  adminMediaDeleteResponse,
  adminListingSummary,
  markReviewedBody,
  rejectListingBody,
  suspendListingBody,
} from '@one/shared'
import {
  PartnerApiError,
  partnerApiDeleteJson,
  partnerApiSend,
  partnerErrorMessage,
} from '@/lib/api'
import type { ActionState } from '@/app/dashboard/[listingId]/actions'

type Tab = 'review' | 'changed' | 'published' | 'suspended'

async function decide(
  listingId: string,
  action: string,
  body: unknown,
  done: string,
  tab: Tab,
  /** Publish, suspend and reinstate say whether the public cache was cleared. */
  reportsCache = false,
  values?: ActionState['values'],
): Promise<ActionState> {
  let cleared: boolean | undefined
  try {
    const path = `/api/v1/admin/listings/${listingId}/${action}`
    if (reportsCache) {
      cleared = (await partnerApiSend(path, 'POST', body, adminDecisionResponse)).publicCacheCleared
    } else {
      await partnerApiSend(path, 'POST', body, adminListingSummary)
    }
  } catch (error) {
    // redirect() throws; nothing catches it here.
    if (error instanceof PartnerApiError && error.code === 'REVIEW_STALE') {
      // The institute edited again: reload so the admin sees the new changes.
      redirect(`/admin/review/${listingId}?stale=1`)
    }
    // Another tab or admin acted first.
    if (error instanceof PartnerApiError && error.status === 409) {
      redirect(`/admin/review?tab=${tab}&done=already`)
    }
    return {
      status: 'error',
      message: partnerErrorMessage(error),
      ...(values ? { values } : {}),
    }
  }
  // False means the public site may lag by up to the cache TTL; say so.
  const notice = cleared === false ? `${done}-slow` : done
  redirect(`/admin/review?tab=${tab}&done=${notice}`)
}

const id = (formData: FormData) => String(formData.get('listingId') ?? '')

function reasonError(reason: string, schema: typeof rejectListingBody): ActionState | null {
  const parsed = schema.safeParse({ reason })
  if (parsed.success) return null
  return {
    status: 'error',
    message: 'Give a reason of 10 to 500 characters.',
    fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    values: { reason },
  }
}

export async function approveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return decide(id(formData), 'publish', {}, 'published', 'review', true)
}

export async function rejectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const reason = String(formData.get('reason') ?? '')
  const invalid = reasonError(reason, rejectListingBody)
  if (invalid) return invalid
  return decide(
    id(formData),
    'reject',
    rejectListingBody.parse({ reason }),
    'rejected',
    'review',
    false,
    { reason },
  )
}

export async function suspendAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const reason = String(formData.get('reason') ?? '')
  const invalid = reasonError(reason, suspendListingBody)
  if (invalid) return invalid
  return decide(
    id(formData),
    'suspend',
    suspendListingBody.parse({ reason }),
    'suspended',
    'suspended',
    true,
    { reason },
  )
}

export async function reinstateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return decide(id(formData), 'reinstate', {}, 'reinstated', 'published', true)
}

export async function markReviewedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const body = markReviewedBody.safeParse({
    changedSinceReviewAt: String(formData.get('changedSinceReviewAt') ?? ''),
  })
  if (!body.success) return { status: 'error', message: 'This listing changed — reload' }
  return decide(id(formData), 'mark-reviewed', body.data, 'reviewed', 'changed')
}

/// Removes one logo or photo; returns the line to show under the grid.
export async function deleteMediaAsAdminAction(
  listingId: string,
  assetId: string,
): Promise<string> {
  try {
    const { publicCacheCleared } = await partnerApiDeleteJson(
      `/api/v1/admin/listings/${listingId}/media/${assetId}`,
      adminMediaDeleteResponse,
    )
    revalidatePath(`/admin/review/${listingId}`)
    return publicCacheCleared
      ? 'Deleted. Removed from the site.'
      : 'Deleted. It may stay visible for up to 5 minutes.'
  } catch (error) {
    return partnerErrorMessage(error)
  }
}
