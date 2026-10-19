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
}

export const watchedValueSchema = z.union([z.string(), z.number(), z.array(z.string()), z.null()])
export type WatchedValue = z.infer<typeof watchedValueSchema>

export const watchedSnapshotSchema = z.object(
  Object.fromEntries(WATCHED_LISTING_FIELDS.map((field) => [field, watchedValueSchema])) as Record<
    WatchedField,
    typeof watchedValueSchema
  >,
)
export type WatchedSnapshot = z.infer<typeof watchedSnapshotSchema>

export const listingChangeSchema = z.object({
  field: z.enum(WATCHED_LISTING_FIELDS),
  before: watchedValueSchema,
  after: watchedValueSchema,
})
export type ListingChange = z.infer<typeof listingChangeSchema>

// Arrays are sets (exam and mode order carries no meaning), and an optional
// text field cleared to '' is the same as one never filled in.
function normalise(value: WatchedValue): WatchedValue {
  if (Array.isArray(value)) return [...value].sort()
  return value === '' ? null : value
}

export function diffSnapshot(before: WatchedSnapshot, after: WatchedSnapshot): ListingChange[] {
  const changes: ListingChange[] = []
  for (const field of WATCHED_LISTING_FIELDS) {
    const from = normalise(before[field])
    const to = normalise(after[field])
    if (JSON.stringify(from) !== JSON.stringify(to))
      changes.push({ field, before: from, after: to })
  }
  return changes
}
