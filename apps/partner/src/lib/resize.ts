/// Client-side only. Shrinks a photo before upload — a data saver on mobile
/// networks — and turns iPhone HEIC (which Safari decodes but the server's
/// image library cannot) into JPEG. The server re-checks and re-encodes
/// everything regardless (BR-019).
export async function downscaleToJpeg(file: File, maxEdge = 2048, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    return canvas.convertToBlob({ type: 'image/jpeg', quality })
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      'image/jpeg',
      quality,
    ),
  )
}
