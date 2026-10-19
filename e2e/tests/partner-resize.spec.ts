/// <reference lib="dom" />
// page.evaluate bodies run in the browser.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import ts from 'typescript'

// The partner app's browser-side resize, run in a real Chromium. The partner
// app itself needs a Clerk session, so this loads only the module under test.
const source = readFileSync(
  fileURLToPath(new URL('../../apps/partner/src/lib/resize.ts', import.meta.url)),
  'utf8',
)
const js = ts
  .transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
  .outputText.replace(/^export /gm, '')

test('a transparent logo comes out on white, not black', async ({ page }) => {
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({ content: `${js}\nwindow.downscaleToJpeg = downscaleToJpeg` })

  const corner = await page.evaluate(async () => {
    // A 100×50 PNG whose left half is fully transparent.
    const source = document.createElement('canvas')
    source.width = 100
    source.height = 50
    const ctx = source.getContext('2d')!
    ctx.fillStyle = '#c00'
    ctx.fillRect(50, 0, 50, 50)
    const png = await new Promise<Blob>((resolve) => source.toBlob((b) => resolve(b!), 'image/png'))
    const file = new File([png], 'logo.png', { type: 'image/png' })

    const jpeg = await (
      window as unknown as { downscaleToJpeg: (f: File) => Promise<Blob> }
    ).downscaleToJpeg(file)
    const bitmap = await createImageBitmap(jpeg)
    const check = document.createElement('canvas')
    check.width = bitmap.width
    check.height = bitmap.height
    const out = check.getContext('2d')!
    out.drawImage(bitmap, 0, 0)
    return [...out.getImageData(5, 5, 1, 1).data.slice(0, 3)]
  })

  // JPEG is lossy: near-white, not exactly 255.
  for (const channel of corner) expect(channel).toBeGreaterThan(240)
})
