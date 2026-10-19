'use client'

import { useState, useTransition } from 'react'
import type { MediaAsset } from '@one/shared'
import { deleteMediaAsAdminAction } from './actions'

/// The listing's logo and photos, each removable on its own (P2c spec §7).
export function AdminMediaGrid({ listingId, media }: { listingId: string; media: MediaAsset[] }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  if (media.length === 0) {
    return <p className="text-sm text-gray-500">No logo or photos.</p>
  }

  return (
    <div className="space-y-2">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {media.map((asset) => (
          <li key={asset.id} className="space-y-1">
            <img
              src={asset.thumbUrl ?? asset.url}
              width={asset.width}
              height={asset.height}
              alt={asset.alt ?? (asset.purpose === 'LOGO' ? 'Logo' : 'Photo')}
              className="aspect-square w-full rounded border border-gray-200 bg-white object-cover"
            />
            <p className="text-xs text-gray-500">{asset.purpose === 'LOGO' ? 'Logo' : 'Photo'}</p>
            <button
              type="button"
              disabled={pending}
              className="tap-target w-full rounded-lg border border-red-600 px-2 text-sm font-medium text-red-700 disabled:opacity-60"
              onClick={() =>
                window.confirm('Delete this photo? The institute will see it gone.') &&
                startTransition(async () => {
                  const result = await deleteMediaAsAdminAction(listingId, asset.id)
                  setMessage(result)
                })
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {message ? (
        <p role="status" className="text-sm text-gray-700">
          {message}
        </p>
      ) : null}
    </div>
  )
}
