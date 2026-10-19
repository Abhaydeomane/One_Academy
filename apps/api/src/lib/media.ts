export type MediaPurpose = 'LOGO' | 'PHOTO'

/// The stored files for one asset (spec §5): two widths for a photo, one
/// square for a logo. Keys are never reused, so every file is cacheable forever.
export function variantKeys(storageKey: string, purpose: MediaPurpose): string[] {
  return purpose === 'LOGO'
    ? [`${storageKey}-256.webp`]
    : [`${storageKey}-640.webp`, `${storageKey}-1600.webp`]
}
