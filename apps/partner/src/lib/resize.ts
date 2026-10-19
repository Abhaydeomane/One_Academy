/// Client-side only. Shrinks a photo before upload — a data saver on mobile
/// networks — and turns iPhone HEIC (which Safari decodes but the server's
/// image library cannot) into JPEG. The server re-checks and re-encodes
/// everything regardless (BR-019).
export async function downscaleToJpeg(file: File, maxEdge = 2048, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  // JPEG has no alpha: a canvas exported as JPEG turns transparent pixels
  // black, so paint white first (a transparent logo stays on white).
  const paint = (ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null) => {
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    paint(canvas.getContext('2d'))
    bitmap.close()
    return canvas.convertToBlob({ type: 'image/jpeg', quality })
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  paint(canvas.getContext('2d'))
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      'image/jpeg',
      quality,
    ),
  )
}
