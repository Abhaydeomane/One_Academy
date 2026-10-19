'use client'

import { useRef, useState, useTransition } from 'react'
import { MEDIA_LIMITS, type MediaAsset } from '@one/shared'
import { downscaleToJpeg } from '@/lib/resize'
import { settle } from '@/lib/settle'
import {
  deleteMediaAction,
  moveMediaAction,
  updateAltAction,
  uploadMediaAction,
  type MediaResult,
} from './media-actions'

const BUTTON =
  'tap-target inline-flex items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
const LOST: MediaResult = { ok: false, message: "We couldn't save that photo. Please try again." }

const PRIMARY =
  'tap-target inline-flex items-center justify-center rounded-lg border border-brand-500 px-4 text-sm font-medium text-brand-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

/// P2c spec §9. Uploads run one file at a time so each gets its own progress
/// line and error; the browser shrinks every file before it is sent.
export function PhotosSection({
  listingId,
  media,
  locked,
}: {
  listingId: string
  media: MediaAsset[]
  locked: boolean
}) {
  const logo = media.find((asset) => asset.purpose === 'LOGO') ?? null
  const photos = media.filter((asset) => asset.purpose === 'PHOTO')
  const photoIds = photos.map((photo) => photo.id)

  const [progress, setProgress] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [pending, startTransition] = useTransition()
  const photoInput = useRef<HTMLInputElement>(null)
  const logoInput = useRef<HTMLInputElement>(null)

  const report = (result: MediaResult) => {
    if (!result.ok) setErrors((current) => [...current, result.message])
  }

  const upload = async (files: File[], purpose: 'LOGO' | 'PHOTO') => {
    setErrors([])
    for (const [index, file] of files.entries()) {
      setProgress(files.length > 1 ? `Uploading ${index + 1} of ${files.length}…` : 'Uploading…')
      let blob: Blob
      try {
        blob = await downscaleToJpeg(file)
      } catch {
        setErrors((current) => [...current, `${file.name}: That file isn't a photo we can use.`])
        continue
      }
      const form = new FormData()
      form.set('listingId', listingId)
      form.set('purpose', purpose)
      form.set('file', blob, 'upload.jpg')
      const result = await settle(
        () => uploadMediaAction(form),
        () => LOST,
      )
      if (!result.ok) setErrors((current) => [...current, `${file.name}: ${result.message}`])
    }
    setProgress(null)
  }

  const onPick = (purpose: 'LOGO' | 'PHOTO') => (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length > 0) startTransition(() => upload(files, purpose))
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Photos of your classrooms, results and faculty help students choose. Don&apos;t upload
        photos of students without permission.
      </p>

      <div className="flex items-center gap-4">
        {logo ? (
          <img
            src={logo.url}
            width={96}
            height={96}
            alt="Your logo"
            className="h-24 w-24 rounded-lg border border-gray-200 bg-white object-contain"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500">
            Logo
          </div>
        )}
        {locked ? null : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={PRIMARY}
              disabled={pending}
              onClick={() => logoInput.current?.click()}
            >
              {logo ? 'Replace logo' : 'Add logo'}
            </button>
            {logo ? (
              <button
                type="button"
                className={BUTTON}
                disabled={pending}
                onClick={() =>
                  window.confirm('Remove your logo?') &&
                  startTransition(async () =>
                    report(
                      await settle(
                        () => deleteMediaAction(listingId, logo.id),
                        () => LOST,
                      ),
                    ),
                  )
                }
              >
                Remove
              </button>
            ) : null}
            <input
              ref={logoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={onPick('LOGO')}
            />
          </div>
        )}
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-gray-500">No photos yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="space-y-2 rounded-lg border border-gray-200 bg-white p-2">
              <div className="relative">
                <img
                  src={photo.thumbUrl ?? photo.url}
                  width={photo.width}
                  height={photo.height}
                  alt={photo.alt ?? `Photo ${index + 1}`}
                  className="aspect-[4/3] w-full rounded-md object-cover"
                />
                {index === 0 ? (
                  <span className="absolute left-1 top-1 rounded bg-brand-500 px-1.5 py-0.5 text-xs font-medium text-white">
                    Cover
                  </span>
                ) : null}
              </div>
              {locked ? null : (
                <>
                  <label className="block">
                    <span className="sr-only">Description of photo {index + 1}</span>
                    <input
                      type="text"
                      defaultValue={photo.alt ?? ''}
                      maxLength={MEDIA_LIMITS.altMax}
                      placeholder="Describe this photo"
                      className="w-full rounded-md border border-gray-300 px-2 py-2 text-base"
                      onBlur={(event) => {
                        const value = event.target.value
                        if (value !== (photo.alt ?? '')) {
                          startTransition(async () =>
                            report(
                              await settle(
                                () => updateAltAction(listingId, photo.id, value),
                                () => LOST,
                              ),
                            ),
                          )
                        }
                      }}
                    />
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      className={BUTTON}
                      disabled={pending || index === 0}
                      aria-label={`Move photo ${index + 1} up`}
                      onClick={() =>
                        startTransition(async () =>
                          report(
                            await settle(
                              () => moveMediaAction(listingId, photoIds, photo.id, 'up'),
                              () => LOST,
                            ),
                          ),
                        )
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={BUTTON}
                      disabled={pending || index === photos.length - 1}
                      aria-label={`Move photo ${index + 1} down`}
                      onClick={() =>
                        startTransition(async () =>
                          report(
                            await settle(
                              () => moveMediaAction(listingId, photoIds, photo.id, 'down'),
                              () => LOST,
                            ),
                          ),
                        )
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={`${BUTTON} text-red-700`}
                      disabled={pending}
                      aria-label={`Delete photo ${index + 1}`}
                      onClick={() =>
                        window.confirm('Delete this photo?') &&
                        startTransition(async () =>
                          report(
                            await settle(
                              () => deleteMediaAction(listingId, photo.id),
                              () => LOST,
                            ),
                          ),
                        )
                      }
                    >
                      ✕
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {locked ? null : (
        <div className="space-y-2">
          <button
            type="button"
            className={PRIMARY}
            disabled={pending || photos.length >= MEDIA_LIMITS.photos}
            onClick={() => photoInput.current?.click()}
          >
            Add photos
          </button>
          <input
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={onPick('PHOTO')}
          />
          {photos.length >= MEDIA_LIMITS.photos ? (
            <p className="text-sm text-gray-600">
              You already have 10 photos. Delete one to add another.
            </p>
          ) : null}
        </div>
      )}

      {progress ? (
        <p role="status" className="text-sm text-gray-700">
          {progress}
        </p>
      ) : null}
      {errors.map((message, index) => (
        <p key={`${index}-${message}`} role="alert" className="text-sm text-red-600">
          {message}
        </p>
      ))}
    </div>
  )
}
