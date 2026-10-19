import { randomUUID } from 'node:crypto'
import type { MediaAsset } from '@one/shared'
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UpstreamUnavailableError,
} from '../../lib/errors.js'
import { logger } from '../../lib/logger.js'
import { toMediaAsset, variantKeys, type MediaPurpose } from '../../lib/media.js'
import { deleteObjects, putObject } from '../../lib/storage.js'
import * as accounts from '../accounts/accounts.service.js'
import { applyPartnerEdit, assertOrgOwnsListing } from '../listings/listings.service.js'
import { processImage } from './media.images.js'
import * as repo from './media.repository.js'

/// Routes receive a Clerk organisation id; R4 keeps them out of accounts.
export async function resolveOrganizationId(clerkOrgId: string): Promise<string> {
  return accounts.resolveLocalOrgId(clerkOrgId)
}

/// Best-effort: a stray file costs storage, never correctness, because no row
/// points at it (spec §6).
async function discard(keys: string[]) {
  if (keys.length === 0) return
  try {
    await deleteObjects(keys)
  } catch (err) {
    logger.warn({ err, keys }, 'media object deletion failed')
  }
}

export async function listForListing(listingId: string): Promise<MediaAsset[]> {
  return (await repo.listByListing(listingId)).map(toMediaAsset)
}

/// BR-019, BR-020. Decode and re-encode first, write the files, then insert the
/// row under the review lock; any failure after the files exist removes them.
export async function uploadForOrg(
  listingId: string,
  organizationId: string,
  input: { buffer: Buffer; purpose: MediaPurpose; alt?: string },
): Promise<MediaAsset> {
  await assertOrgOwnsListing(listingId, organizationId)
  const image = await processImage(input.buffer, input.purpose)
  const storageKey = `listings/${listingId}/${randomUUID()}`

  const written: string[] = []
  try {
    for (const variant of image.variants) {
      const key = `${storageKey}-${variant.suffix}.webp`
      await putObject(key, variant.body, 'image/webp')
      written.push(key)
    }
  } catch (err) {
    logger.error({ err, storageKey }, 'media storage write failed')
    await discard(written)
    throw new UpstreamUnavailableError('Media storage is unavailable')
  }

  try {
    const result = await applyPartnerEdit(listingId, async () => {
      const inserted = await repo.insertGuarded({
        listingId,
        purpose: input.purpose,
        storageKey,
        alt: input.alt ? input.alt : null,
        width: image.width,
        height: image.height,
      })
      if (inserted === 'LIMIT') {
        throw new ConflictError('MEDIA_LIMIT_REACHED', 'A listing can have at most 10 photos')
      }
      return inserted
    })
    if (result.replacedKey) await discard(variantKeys(result.replacedKey, 'LOGO'))
    return toMediaAsset(result.row)
  } catch (error) {
    await discard(written)
    throw error
  }
}

/// The asset, after checking it belongs to one of the organisation's listings.
async function ownedAsset(assetId: string, organizationId: string) {
  const asset = await repo.findById(assetId)
  if (!asset) throw new NotFoundError('Media not found')
  try {
    await assertOrgOwnsListing(asset.listingId, organizationId)
  } catch (error) {
    if (error instanceof ForbiddenError)
      throw new ForbiddenError('Media belongs to another organisation')
    throw error
  }
  return asset
}

export async function updateAltForOrg(
  assetId: string,
  organizationId: string,
  alt: string | null,
): Promise<MediaAsset> {
  const asset = await ownedAsset(assetId, organizationId)
  const row = await applyPartnerEdit(asset.listingId, () =>
    repo.updateAltGuarded(assetId, asset.listingId, alt ? alt : null),
  )
  return toMediaAsset(row)
}

export async function reorderForOrg(
  listingId: string,
  organizationId: string,
  assetIds: string[],
): Promise<MediaAsset[]> {
  await assertOrgOwnsListing(listingId, organizationId)
  const rows = await applyPartnerEdit(listingId, async () => {
    const result = await repo.reorderGuarded(listingId, assetIds)
    if (result === 'MISMATCH') {
      throw new BadRequestError('The order must list every photo of this listing exactly once')
    }
    return result
  })
  return rows.map(toMediaAsset)
}

/// The row goes first; the files after, best-effort (spec §6).
export async function deleteForOrg(assetId: string, organizationId: string): Promise<void> {
  const asset = await ownedAsset(assetId, organizationId)
  const removed = await applyPartnerEdit(asset.listingId, () =>
    repo.deleteGuarded(assetId, asset.listingId),
  )
  await discard(variantKeys(removed.storageKey, removed.purpose))
}
