'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  batchSummary,
  createBatchBody,
  normalizePhone,
  partnerBatchSummary,
  partnerListingDetail,
  updateListingBody,
} from '@one/shared'
import { partnerApiSend, partnerErrorMessage } from '@/lib/api'

export type ActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string[]>
}

export async function createBatchAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const listingId = String(formData.get('listingId') ?? '')

  const optional = (key: string) => {
    const value = formData.get(key)
    return typeof value === 'string' && value.length > 0 ? value : undefined
  }

  // The form collects rupees because that is what a person types; BR-005 is
  // satisfied by converting to integer paise at this boundary.
  const feeRupees = Number(formData.get('feeRupees') ?? '0')

  const raw = {
    title: String(formData.get('title') ?? ''),
    exam: String(formData.get('exam') ?? ''),
    mode: String(formData.get('mode') ?? 'OFFLINE'),
    startDate: String(formData.get('startDate') ?? ''),
    ...(optional('endDate') ? { endDate: optional('endDate') } : {}),
    ...(optional('scheduleText') ? { scheduleText: optional('scheduleText') } : {}),
    seatsTotal: Number(formData.get('seatsTotal') ?? '0'),
    feeAmount: Math.round(feeRupees * 100),
    feeCurrency: 'INR',
  }

  const parsed = createBatchBody.safeParse(raw)
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  try {
    await partnerApiSend(
      `/api/v1/partner/listings/${listingId}/batches`,
      'POST',
      parsed.data,
      batchSummary,
    )
    revalidatePath(`/dashboard/${listingId}`)
    return { status: 'success', message: 'Batch created as a draft.' }
  } catch (error) {
    return { status: 'error', message: partnerErrorMessage(error) }
  }
}

export async function publishBatchAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const listingId = String(formData.get('listingId') ?? '')
  const batchId = String(formData.get('batchId') ?? '')

  try {
    await partnerApiSend(
      `/api/v1/partner/batches/${batchId}`,
      'PATCH',
      { status: 'PUBLISHED' },
      partnerBatchSummary,
    )
    revalidatePath(`/dashboard/${listingId}`)
    return { status: 'success', message: 'Batch published.' }
  } catch (error) {
    return { status: 'error', message: partnerErrorMessage(error) }
  }
}

export async function submitListingAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const listingId = String(formData.get('listingId') ?? '')

  try {
    await partnerApiSend(
      `/api/v1/partner/listings/${listingId}/submit`,
      'POST',
      {},
      partnerListingDetail,
    )
    revalidatePath(`/dashboard/${listingId}`)
    return { status: 'success', message: 'Submitted for review.' }
  } catch (error) {
    return { status: 'error', message: partnerErrorMessage(error) }
  }
}

export async function updateVerificationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const listingId = String(formData.get('listingId') ?? '')
  const text = (key: string) => {
    const value = formData.get(key)
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
  }
  const examSlugs = formData.getAll('examSlugs').map(String)
  const phone = text('contactPhone')

  const raw = {
    ...(text('address') ? { address: text('address') } : {}),
    // Review Focus 1: "+91 98765 43210" is how people type it.
    ...(phone ? { contactPhone: normalizePhone(phone) } : {}),
    ...(examSlugs.length > 0 ? { examSlugs } : {}),
    // A disabled select is not submitted, so city is only sent while editable.
    ...(text('citySlug') ? { citySlug: text('citySlug') } : {}),
  }

  const parsed = updateListingBody.safeParse(raw)
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    }
  }

  try {
    await partnerApiSend(
      `/api/v1/partner/listings/${listingId}`,
      'PATCH',
      parsed.data,
      partnerListingDetail,
    )
    revalidatePath(`/dashboard/${listingId}`)
    return { status: 'success', message: 'Details saved.' }
  } catch (error) {
    return { status: 'error', message: partnerErrorMessage(error) }
  }
}
