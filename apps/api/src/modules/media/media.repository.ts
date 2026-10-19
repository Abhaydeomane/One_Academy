import { prisma } from '@one/db'
import { MEDIA_LIMITS } from '@one/shared'

// Plain row types, declared here rather than imported: a repository reaches
// into nothing outside its module (R4). lib/media.ts accepts them structurally.
export type MediaPurpose = 'LOGO' | 'PHOTO'

export type MediaRow = {
  id: string
  purpose: MediaPurpose
  storageKey: string
  alt: string | null
  width: number
  height: number
  sortOrder: number
}

const MEDIA_SELECT = {
  id: true,
  purpose: true,
  storageKey: true,
  alt: true,
  width: true,
  height: true,
  sortOrder: true,
} as const

/// Logo first (enum order), then photos in display order.
export async function listByListing(listingId: string): Promise<MediaRow[]> {
  return prisma.mediaAsset.findMany({
    where: { listingId },
    orderBy: [{ purpose: 'asc' }, { sortOrder: 'asc' }],
    select: MEDIA_SELECT,
  })
}

export type NewMedia = {
  listingId: string
  purpose: MediaPurpose
  storageKey: string
  alt: string | null
  width: number
  height: number
}

/// BR-017 and BR-020 in one transaction. The guarded listing update refuses a
/// listing in review and takes its row lock, so concurrent uploads to one
/// listing run one at a time and the photo count cannot be overshot. A new logo
/// replaces the old one; its key comes back so the caller can delete the files.
export async function insertGuarded(
  media: NewMedia,
): Promise<{ row: MediaRow; replacedKey: string | null } | false | 'LIMIT'> {
  return prisma.$transaction(async (tx) => {
    const guard = await tx.listing.updateMany({
      where: { id: media.listingId, status: { not: 'PENDING_REVIEW' } },
      data: { updatedAt: new Date() },
    })
    if (guard.count === 0) return false

    let replacedKey: string | null = null
    if (media.purpose === 'PHOTO') {
      const photos = await tx.mediaAsset.count({
        where: { listingId: media.listingId, purpose: 'PHOTO' },
      })
      if (photos >= MEDIA_LIMITS.photos) return 'LIMIT'
    } else {
      const old = await tx.mediaAsset.findFirst({
        where: { listingId: media.listingId, purpose: 'LOGO' },
        select: { id: true, storageKey: true },
      })
      if (old) {
        await tx.mediaAsset.delete({ where: { id: old.id } })
        replacedKey = old.storageKey
      }
    }

    const last = await tx.mediaAsset.aggregate({
      where: { listingId: media.listingId, purpose: media.purpose },
      _max: { sortOrder: true },
    })
    const row = await tx.mediaAsset.create({
      data: { ...media, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: MEDIA_SELECT,
    })
    return { row, replacedKey }
  })
}
