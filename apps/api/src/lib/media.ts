import type { MediaAsset } from '@one/shared'
import { publicUrl } from './storage.js'

export type MediaPurpose = 'LOGO' | 'PHOTO'

/// The stored files for one asset (spec §5): two widths for a photo, one
/// square for a logo. Keys are never reused, so every file is cacheable forever.
export function variantKeys(storageKey: string, purpose: MediaPurpose): string[] {
  return purpose === 'LOGO'
    ? [`${storageKey}-256.webp`]
    : [`${storageKey}-640.webp`, `${storageKey}-1600.webp`]
}

export type MediaRow = {
  id: string
  purpose: MediaPurpose
  storageKey: string
  alt: string | null
  width: number
  height: number
  sortOrder: number
}

/// Shared by the media and listings modules (lib, so R4 allows both).
export function toMediaAsset(row: MediaRow): MediaAsset {
  const logo = row.purpose === 'LOGO'
  return {
    id: row.id,
    purpose: row.purpose,
    url: publicUrl(`${row.storageKey}-${logo ? '256' : '1600'}.webp`),
    thumbUrl: logo ? null : publicUrl(`${row.storageKey}-640.webp`),
    alt: row.alt,
    width: row.width,
    height: row.height,
    sortOrder: row.sortOrder,
  }
}
