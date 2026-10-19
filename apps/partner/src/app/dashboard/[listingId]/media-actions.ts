'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { mediaAsset, updateMediaBody } from '@one/shared'
import { mediaErrorMessage, partnerApiDelete, partnerApiSend, partnerApiUpload } from '@/lib/api'

export type MediaResult = { ok: true } | { ok: false; message: string }

const refresh = (listingId: string) => revalidatePath(`/dashboard/${listingId}`)

/// One file per call, so the client can show "Uploading 2 of 4…" and a
/// per-file error. The form carries `listingId`, `purpose` and `file`.
export async function uploadMediaAction(form: FormData): Promise<MediaResult> {
  const listingId = String(form.get('listingId') ?? '')
  const upload = new FormData()
  upload.set('purpose', String(form.get('purpose') ?? 'PHOTO'))
  const file = form.get('file')
  if (!(file instanceof Blob)) return { ok: false, message: "That file isn't a photo we can use." }
  upload.set('file', file, 'upload.jpg')
  try {
    await partnerApiUpload(`/api/v1/partner/listings/${listingId}/media`, upload, mediaAsset)
    refresh(listingId)
    return { ok: true }
  } catch (error) {
    return { ok: false, message: mediaErrorMessage(error) }
  }
}

export async function updateAltAction(
  listingId: string,
  assetId: string,
  alt: string,
): Promise<MediaResult> {
  const body = updateMediaBody.safeParse({ alt: alt.trim() ? alt : null })
  if (!body.success) return { ok: false, message: 'Keep the description under 120 characters.' }
  try {
    await partnerApiSend(`/api/v1/partner/media/${assetId}`, 'PATCH', body.data, mediaAsset)
    refresh(listingId)
    return { ok: true }
  } catch (error) {
    return { ok: false, message: mediaErrorMessage(error) }
  }
}

/// Moves one photo a place up or down; the API takes the whole order.
export async function moveMediaAction(
  listingId: string,
  photoIds: string[],
  assetId: string,
  direction: 'up' | 'down',
): Promise<MediaResult> {
  const from = photoIds.indexOf(assetId)
  const to = direction === 'up' ? from - 1 : from + 1
  if (from < 0 || to < 0 || to >= photoIds.length) return { ok: true }
  const order = [...photoIds]
  ;[order[from], order[to]] = [order[to]!, order[from]!]
  try {
    await partnerApiSend(
      `/api/v1/partner/listings/${listingId}/media/order`,
      'PUT',
      { assetIds: order },
      z.array(mediaAsset),
    )
    refresh(listingId)
    return { ok: true }
  } catch (error) {
    refresh(listingId)
    return { ok: false, message: mediaErrorMessage(error) }
  }
}

export async function deleteMediaAction(listingId: string, assetId: string): Promise<MediaResult> {
  try {
    await partnerApiDelete(`/api/v1/partner/media/${assetId}`)
    refresh(listingId)
    return { ok: true }
  } catch (error) {
    return { ok: false, message: mediaErrorMessage(error) }
  }
}
