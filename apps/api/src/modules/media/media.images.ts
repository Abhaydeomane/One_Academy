import sharp from 'sharp'
import { MEDIA_LIMITS } from '@one/shared'
import { MediaInvalidError } from '../../lib/errors.js'
import type { MediaPurpose } from '../../lib/media.js'

export type ProcessedImage = {
  variants: { suffix: '640' | '1600' | '256'; body: Buffer }[]
  /// Dimensions of the largest variant.
  width: number
  height: number
}

const ACCEPTED = new Set(['jpeg', 'png', 'webp'])

/// BR-019: every upload is decoded, so the content — never the filename or the
/// declared type — decides what is stored. Orientation is applied, then all
/// metadata (GPS, camera, timestamps) is dropped by re-encoding without it.
export async function processImage(input: Buffer, purpose: MediaPurpose): Promise<ProcessedImage> {
  const open = () => sharp(input, { limitInputPixels: MEDIA_LIMITS.maxPixels, failOn: 'error' })

  let format: string | undefined
  try {
    format = (await open().metadata()).format
  } catch (error) {
    throw toMediaError(error)
  }
  if (!format || !ACCEPTED.has(format)) throw new MediaInvalidError('NOT_AN_IMAGE')

  try {
    if (purpose === 'LOGO') {
      const { data, info } = await open()
        .rotate()
        .resize(256, 256, { fit: 'contain', background: '#ffffff' })
        .flatten({ background: '#ffffff' })
        .webp({ quality: 85 })
        .toBuffer({ resolveWithObject: true })
      return { variants: [{ suffix: '256', body: data }], width: info.width, height: info.height }
    }

    const small = await open()
      .rotate()
      .resize({ width: 640, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
    const { data, info } = await open()
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true })
    return {
      variants: [
        { suffix: '640', body: small },
        { suffix: '1600', body: data },
      ],
      width: info.width,
      height: info.height,
    }
  } catch (error) {
    throw toMediaError(error)
  }
}

// sharp checks limitInputPixels as soon as it reads the header, so a
// decompression bomb is refused before it is decoded.
function toMediaError(error: unknown): MediaInvalidError {
  if (error instanceof Error && /pixel limit/i.test(error.message)) {
    return new MediaInvalidError('TOO_MANY_PIXELS', 'That photo is too large to process')
  }
  return new MediaInvalidError('NOT_AN_IMAGE')
}
