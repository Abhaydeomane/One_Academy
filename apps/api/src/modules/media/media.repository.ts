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

export async function findById(id: string): Promise<(MediaRow & { listingId: string }) | null> {
  return prisma.mediaAsset.findUnique({
    where: { id },
    select: { ...MEDIA_SELECT, listingId: true },
  })
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/// BR-017 for writes that are not uploads: refuses a listing in review and
/// holds its row lock for the rest of the transaction.
async function lockEditable(tx: Tx, listingId: string): Promise<boolean> {
  const guard = await tx.listing.updateMany({
    where: { id: listingId, status: { not: 'PENDING_REVIEW' } },
    data: { updatedAt: new Date() },
  })
  return guard.count > 0
}

export async function updateAltGuarded(
  id: string,
  listingId: string,
  alt: string | null,
): Promise<MediaRow | false> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockEditable(tx, listingId))) return false
    return tx.mediaAsset.update({ where: { id }, data: { alt }, select: MEDIA_SELECT })
  })
}

/// 'MISMATCH' unless assetIds is exactly the listing's photos, each once.
export async function reorderGuarded(
  listingId: string,
  assetIds: string[],
): Promise<MediaRow[] | false | 'MISMATCH'> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockEditable(tx, listingId))) return false
    const photos = await tx.mediaAsset.findMany({
      where: { listingId, purpose: 'PHOTO' },
      select: { id: true },
    })
    const current = new Set(photos.map((photo) => photo.id))
    const wanted = new Set(assetIds)
    if (
      wanted.size !== assetIds.length ||
      wanted.size !== current.size ||
      assetIds.some((id) => !current.has(id))
    ) {
      return 'MISMATCH'
    }
    for (const [index, id] of assetIds.entries()) {
      await tx.mediaAsset.update({ where: { id }, data: { sortOrder: index } })
    }
    return tx.mediaAsset.findMany({
      where: { listingId },
      orderBy: [{ purpose: 'asc' }, { sortOrder: 'asc' }],
      select: MEDIA_SELECT,
    })
  })
}

export async function deleteGuarded(
  id: string,
  listingId: string,
): Promise<{ storageKey: string; purpose: MediaPurpose } | false> {
  return prisma.$transaction(async (tx) => {
    if (!(await lockEditable(tx, listingId))) return false
    return tx.mediaAsset.delete({ where: { id }, select: { storageKey: true, purpose: true } })
  })
}

/// An admin's removal: any status, so no review lock (spec §7).
export async function deleteFromListing(
  id: string,
  listingId: string,
): Promise<{ storageKey: string; purpose: MediaPurpose } | null> {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id, listingId },
    select: { storageKey: true, purpose: true },
  })
  if (!asset) return null
  await prisma.mediaAsset.delete({ where: { id } })
  return asset
}

export async function listLogos(
  listingIds: string[],
): Promise<{ listingId: string; storageKey: string }[]> {
  if (listingIds.length === 0) return []
  return prisma.mediaAsset.findMany({
    where: { listingId: { in: listingIds }, purpose: 'LOGO' },
    select: { listingId: true, storageKey: true },
  })
}
