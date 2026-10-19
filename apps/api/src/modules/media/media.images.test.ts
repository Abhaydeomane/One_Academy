import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { jpegWithExifGps, solidImage } from '../../../test/helpers/images.js'
import { processImage } from './media.images.js'

const variant = (result: Awaited<ReturnType<typeof processImage>>, suffix: string) => {
  const found = result.variants.find((v) => v.suffix === suffix)
  if (!found) throw new Error(`no ${suffix} variant`)
  return found.body
}

describe('fixtures', () => {
  it('the EXIF fixture really carries EXIF and orientation 6', async () => {
    const meta = await sharp(
      await jpegWithExifGps({ width: 40, height: 20, orientation: 6 }),
    ).metadata()
    expect(meta.exif).toBeDefined()
    expect(meta.orientation).toBe(6)
  })
})

describe('processImage (BR-019)', () => {
  it('rotates by EXIF orientation and strips all metadata', async () => {
    const input = await jpegWithExifGps({ width: 40, height: 20, orientation: 6 })
    const result = await processImage(input, 'PHOTO')
    const meta = await sharp(variant(result, '1600')).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 20, height: 40 })
    expect(meta.exif).toBeUndefined()
    expect(result).toMatchObject({ width: 20, height: 40 })
  })

  it('never upscales', async () => {
    const result = await processImage(
      await solidImage({ width: 300, height: 200, format: 'jpeg' }),
      'PHOTO',
    )
    expect((await sharp(variant(result, '640')).metadata()).width).toBe(300)
    expect((await sharp(variant(result, '1600')).metadata()).width).toBe(300)
  })

  it('writes 640 and 1600 variants for a large photo', async () => {
    const result = await processImage(
      await solidImage({ width: 3000, height: 2000, format: 'png' }),
      'PHOTO',
    )
    expect((await sharp(variant(result, '640')).metadata()).width).toBe(640)
    expect((await sharp(variant(result, '1600')).metadata()).width).toBe(1600)
    expect(result).toMatchObject({ width: 1600, height: 1067 })
  })

  it('flattens a transparent logo onto white', async () => {
    const input = await solidImage({ width: 100, height: 50, format: 'png', alpha: true })
    const result = await processImage(input, 'LOGO')
    const logo = sharp(variant(result, '256'))
    const meta = await logo.metadata()
    expect(meta).toMatchObject({ width: 256, height: 256, hasAlpha: false })
    const { data } = await logo.raw().toBuffer({ resolveWithObject: true })
    expect([...data.subarray(0, 3)]).toEqual([255, 255, 255])
  })

  it.each([
    [
      'an SVG',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    ],
    ['text', Buffer.from('hello')],
    ['random bytes', randomBytes(1024)],
  ])('rejects %s as NOT_AN_IMAGE', async (_label, input) => {
    await expect(processImage(input, 'PHOTO')).rejects.toMatchObject({
      code: 'MEDIA_INVALID',
      details: { reason: 'NOT_AN_IMAGE' },
    })
  })

  it('rejects 7000×7000 as TOO_MANY_PIXELS', async () => {
    const input = await solidImage({ width: 7000, height: 7000, format: 'png' })
    await expect(processImage(input, 'PHOTO')).rejects.toMatchObject({
      code: 'MEDIA_INVALID',
      details: { reason: 'TOO_MANY_PIXELS' },
    })
  })
})
