import {
  WATCHED_FIELD_LABELS,
  type ListingChange,
  type MediaAsset,
  type WatchedValue,
} from '@one/shared'

function show(value: WatchedValue): string {
  if (value === null) return '—'
  return Array.isArray(value) ? value.join(', ') || '—' : String(value)
}

const ids = (value: WatchedValue): string[] =>
  Array.isArray(value) ? value : typeof value === 'string' ? [value] : []

function Thumbs({ assetIds, media }: { assetIds: string[]; media: Map<string, MediaAsset> }) {
  if (assetIds.length === 0) return <p className="text-sm text-gray-500">None</p>
  return (
    <ul className="flex flex-wrap gap-2">
      {assetIds.map((id) => {
        const asset = media.get(id)
        return (
          <li key={id}>
            {asset ? (
              <img
                src={asset.thumbUrl ?? asset.url}
                width={64}
                height={64}
                alt={asset.alt ?? ''}
                className="h-16 w-16 rounded border border-gray-200 bg-white object-cover"
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-gray-300 text-center text-xs text-gray-500">
                Removed photo
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/// BR-018: what a published institute changed since approval, before → after.
/// Logo and photo changes show as thumbnails (P2c).
export function ChangesList({ changes, media }: { changes: ListingChange[]; media: MediaAsset[] }) {
  const byId = new Map(media.map((asset) => [asset.id, asset]))
  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-amber-200 bg-white px-4">
      {changes.map((change) => {
        const imageField = change.field === 'logo' || change.field === 'photos'
        const before = ids(change.before)
        const after = ids(change.after)
        const reordered =
          change.field === 'photos' &&
          before.length === after.length &&
          before.every((id) => after.includes(id))
        return (
          <li key={change.field} className="space-y-1 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {WATCHED_FIELD_LABELS[change.field]}
            </p>
            {reordered ? (
              <>
                <p className="text-sm text-gray-900">Photo order changed</p>
                <Thumbs assetIds={after} media={byId} />
              </>
            ) : imageField ? (
              <>
                <p className="text-xs text-gray-500">Before</p>
                <Thumbs assetIds={before} media={byId} />
                <p className="text-xs text-gray-500">After</p>
                <Thumbs assetIds={after} media={byId} />
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 line-through">{show(change.before)}</p>
                <p className="text-base text-gray-900">{show(change.after)}</p>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}
