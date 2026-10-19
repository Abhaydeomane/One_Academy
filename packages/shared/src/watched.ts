import { z } from 'zod'

/// BR-018: the listing details verification looked at, plus what students
/// read. An edit to any of them on a published listing goes live and flags the
/// listing for review. The API snapshots these and the admin diff shows them,
/// from this one list, so the two cannot disagree.
export const WATCHED_LISTING_FIELDS = [
  'name',
  'shortDescription',
  'locality',
  'address',
  'contactPhone',
  'about',
  'website',
  'establishedYear',
  'facultyCount',
  'modes',
  'exams',
  'logo',
  'photos',
] as const
export type WatchedField = (typeof WATCHED_LISTING_FIELDS)[number]

export const WATCHED_FIELD_LABELS: Record<WatchedField, string> = {
  name: 'Name',
  shortDescription: 'Short description',
  locality: 'Locality',
  address: 'Address',
  contactPhone: 'Contact phone',
  about: 'About',
  website: 'Website',
  establishedYear: 'Established',
  facultyCount: 'Faculty',
  modes: 'Modes',
  exams: 'Exams',
  logo: 'Logo',
  photos: 'Photos',
}

export const watchedValueSchema = z.union([z.string(), z.number(), z.array(z.string()), z.null()])
export type WatchedValue = z.infer<typeof watchedValueSchema>

// `logo` and `photos` joined in P2c. A snapshot saved before then has neither,
// and no media existed then, so they default to "none" — the snapshot still
// parses instead of being re-baselined over unreviewed changes.
export const watchedSnapshotSchema = z.object({
  ...(Object.fromEntries(
    WATCHED_LISTING_FIELDS.map((field) => [field, watchedValueSchema]),
  ) as Record<WatchedField, typeof watchedValueSchema>),
  logo: watchedValueSchema.default(null),
  photos: watchedValueSchema.default([]),
})
export type WatchedSnapshot = z.infer<typeof watchedSnapshotSchema>

export const listingChangeSchema = z.object({
  field: z.enum(WATCHED_LISTING_FIELDS),
  before: watchedValueSchema,
  after: watchedValueSchema,
})
export type ListingChange = z.infer<typeof listingChangeSchema>

// Arrays are sets (exam and mode order carries no meaning) — except photos,
// where the first is the cover students see. An optional text field cleared
// to '' is the same as one never filled in.
const ORDERED: ReadonlySet<WatchedField> = new Set(['photos'])

function normalise(field: WatchedField, value: WatchedValue): WatchedValue {
  if (Array.isArray(value)) return ORDERED.has(field) ? [...value] : [...value].sort()
  return value === '' ? null : value
}

export function diffSnapshot(before: WatchedSnapshot, after: WatchedSnapshot): ListingChange[] {
  const changes: ListingChange[] = []
  for (const field of WATCHED_LISTING_FIELDS) {
    const from = normalise(field, before[field])
    const to = normalise(field, after[field])
    if (JSON.stringify(from) !== JSON.stringify(to))
      changes.push({ field, before: from, after: to })
  }
  return changes
}
