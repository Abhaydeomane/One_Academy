import sharp from 'sharp'

/// Fixture images, generated rather than checked in.

export async function solidImage({
  width,
  height,
  format,
  alpha = false,
}: {
  width: number
  height: number
  format: 'jpeg' | 'png' | 'webp'
  alpha?: boolean
}): Promise<Buffer> {
  const image = sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha ? { r: 200, g: 0, b: 0, alpha: 0 } : { r: 200, g: 0, b: 0 },
    },
  })
  return image.toFormat(format).toBuffer()
}

/// A phone-style JPEG: rotated by EXIF orientation and carrying a GPS position.
export async function jpegWithExifGps({
  width,
  height,
  orientation,
}: {
  width: number
  height: number
  orientation: number
}): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#336699' } })
    .jpeg()
    .withMetadata({ orientation })
    .withExifMerge({
      IFD0: { Make: 'TestPhone' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '18/1 31/1 0/1' },
    })
    .toBuffer()
}
