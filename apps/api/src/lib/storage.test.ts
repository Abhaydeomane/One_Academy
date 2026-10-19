import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { testApp } from '../../test/helpers/app.js'
import { variantKeys } from './media.js'
import { deleteObjects, publicUrl, putObject } from './storage.js'

const root = process.env.MEDIA_FS_ROOT!
const key = (name: string) => `listings/test/${name}-${Date.now()}`

describe('storage (fs driver)', () => {
  it('putObject writes the bytes under the key', async () => {
    const k = key('put')
    await putObject(k, Buffer.from('hello'), 'text/plain')
    expect(await readFile(join(root, k), 'utf8')).toBe('hello')
  })

  it('deleteObjects removes every key and ignores a missing one', async () => {
    const a = key('a')
    const b = key('b')
    await putObject(a, Buffer.from('a'), 'text/plain')
    await putObject(b, Buffer.from('b'), 'text/plain')
    await deleteObjects([a, b, key('never-written')])
    await expect(readFile(join(root, a))).rejects.toThrow()
    await expect(readFile(join(root, b))).rejects.toThrow()
  })

  it('publicUrl joins the base URL and the key', () => {
    expect(publicUrl('listings/l1/abc-640.webp')).toBe(
      'http://localhost:4000/media/listings/l1/abc-640.webp',
    )
  })

  it('variantKeys gives two webp keys for a photo and one for a logo', () => {
    expect(variantKeys('listings/l1/abc', 'PHOTO')).toEqual([
      'listings/l1/abc-640.webp',
      'listings/l1/abc-1600.webp',
    ])
    expect(variantKeys('listings/l1/abc', 'LOGO')).toEqual(['listings/l1/abc-256.webp'])
  })

  it('serves a stored object at /media with an immutable cache header', async () => {
    const k = `${key('served')}-640.webp`
    await mkdir(dirname(join(root, k)), { recursive: true })
    await writeFile(join(root, k), Buffer.from('webp-bytes'))
    const res = await testApp().get(`/media/${k}`)
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toContain('immutable')
  })
})
