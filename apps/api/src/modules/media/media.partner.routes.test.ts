import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@one/db'
import { mediaAsset, partnerListingDetail } from '@one/shared'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { testApp } from '../../../test/helpers/app.js'
import { solidImage } from '../../../test/helpers/images.js'

vi.mock('../../lib/clerk.js', () => ({ fetchClerkOrganization: vi.fn() }))

const root = process.env.MEDIA_FS_ROOT!
let seed: MinimalSeed
let jpeg: Buffer

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
  await prisma.organization.update({ where: { id: seed.orgId }, data: { clerkOrgId: 'co_alpha' } })
  await prisma.organization.update({
    where: { id: seed.otherOrgId },
    data: { clerkOrgId: 'co_beta' },
  })
  jpeg ??= await solidImage({ width: 1200, height: 800, format: 'jpeg' })
})

afterAll(async () => {
  await prisma.$disconnect()
})

const auth = (org = 'co_alpha') => JSON.stringify({ userId: 'u1', orgId: org, globalRole: 'USER' })

const upload = (
  listingId: string,
  file: Buffer | null,
  {
    purpose = 'PHOTO',
    name = 'photo.jpg',
    org = 'co_alpha',
    alt,
  }: { purpose?: string; name?: string; org?: string; alt?: string } = {},
) => {
  let req = testApp()
    .post(`/api/v1/partner/listings/${listingId}/media`)
    .set('x-test-auth', auth(org))
    .field('purpose', purpose)
  if (alt !== undefined) req = req.field('alt', alt)
  return file ? req.attach('file', file, name) : req
}

async function filesUnder(listingId: string): Promise<string[]> {
  try {
    return await readdir(join(root, 'listings', listingId))
  } catch {
    return []
  }
}

async function addPhotos(listingId: string, count: number) {
  for (let i = 0; i < count; i++) {
    await prisma.mediaAsset.create({
      data: {
        listingId,
        purpose: 'PHOTO',
        storageKey: `listings/${listingId}/seed-${i}-${Date.now()}`,
        width: 10,
        height: 10,
        sortOrder: i,
      },
    })
  }
}

describe('POST /api/v1/partner/listings/:listingId/media (BR-019, BR-020)', () => {
  it('uploads a photo, stores both variants, returns absolute URLs', async () => {
    const res = await upload(seed.draftListingId, jpeg, { alt: 'Main classroom' })
    expect(res.status).toBe(201)
    const asset = mediaAsset.parse(res.body)
    expect(asset).toMatchObject({
      purpose: 'PHOTO',
      alt: 'Main classroom',
      width: 1200,
      height: 800,
    })
    expect(asset.url).toMatch(/^http:\/\/localhost:4000\/media\/listings\/.+-1600\.webp$/)
    expect(asset.thumbUrl).toMatch(/-640\.webp$/)
    const files = await filesUnder(seed.draftListingId)
    expect(files.filter((f) => f.endsWith('-640.webp'))).toHaveLength(1)
    expect(files.filter((f) => f.endsWith('-1600.webp'))).toHaveLength(1)
  })

  it('accepts a PNG named .jpg', async () => {
    const png = await solidImage({ width: 50, height: 50, format: 'png' })
    expect((await upload(seed.draftListingId, png, { name: 'photo.jpg' })).status).toBe(201)
  })

  it('400s an SVG named .jpg with MEDIA_INVALID NOT_AN_IMAGE and writes nothing', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    const res = await upload(seed.draftListingId, svg, { name: 'photo.jpg' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatchObject({
      code: 'MEDIA_INVALID',
      details: { reason: 'NOT_AN_IMAGE' },
    })
    expect(await filesUnder(seed.draftListingId)).toEqual([])
    expect(await prisma.mediaAsset.count()).toBe(0)
  })

  it('400s 8 MB + 1 byte as TOO_LARGE', async () => {
    const res = await upload(seed.draftListingId, Buffer.alloc(8 * 1024 * 1024 + 1))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatchObject({
      code: 'MEDIA_INVALID',
      details: { reason: 'TOO_LARGE' },
    })
  })

  it('409s the 11th photo with MEDIA_LIMIT_REACHED', async () => {
    await addPhotos(seed.draftListingId, 10)
    const res = await upload(seed.draftListingId, jpeg)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('MEDIA_LIMIT_REACHED')
    expect(await prisma.mediaAsset.count({ where: { listingId: seed.draftListingId } })).toBe(10)
  })

  it('never exceeds 10 photos under concurrent uploads', async () => {
    await addPhotos(seed.draftListingId, 9)
    const results = await Promise.all([1, 2, 3].map(() => upload(seed.draftListingId, jpeg)))
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409])
    expect(await prisma.mediaAsset.count({ where: { listingId: seed.draftListingId } })).toBe(10)
  })

  it("replaces the logo and deletes the old logo's object", async () => {
    const logo = await solidImage({ width: 300, height: 300, format: 'png' })
    const first = mediaAsset.parse(
      (await upload(seed.draftListingId, logo, { purpose: 'LOGO' })).body,
    )
    const firstFile = join(root, new URL(first.url).pathname.replace(/^\/media\//, ''))
    await expect(stat(firstFile)).resolves.toBeTruthy()

    const second = await upload(seed.draftListingId, logo, { purpose: 'LOGO' })
    expect(second.status).toBe(201)
    expect(
      await prisma.mediaAsset.count({ where: { listingId: seed.draftListingId, purpose: 'LOGO' } }),
    ).toBe(1)
    await expect(stat(firstFile)).rejects.toThrow()
    expect(mediaAsset.parse(second.body)).toMatchObject({ width: 256, height: 256, thumbUrl: null })
  })

  it("403s another organisation's listing", async () => {
    expect((await upload(seed.draftListingId, jpeg, { org: 'co_beta' })).status).toBe(403)
  })

  it('400s a missing file', async () => {
    const res = await upload(seed.draftListingId, null)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('400s alt over 120 characters', async () => {
    const res = await upload(seed.draftListingId, jpeg, { alt: 'a'.repeat(121) })
    expect(res.status).toBe(400)
    expect(await prisma.mediaAsset.count()).toBe(0)
  })

  it('409s LISTING_UNDER_REVIEW for an upload to a listing in review and writes nothing', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    const res = await upload(seed.draftListingId, jpeg)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LISTING_UNDER_REVIEW')
    expect(await prisma.mediaAsset.count()).toBe(0)
    expect(await filesUnder(seed.draftListingId)).toEqual([])
  })

  it('returns media in the partner listing detail, logo first', async () => {
    await upload(seed.draftListingId, jpeg)
    await upload(
      seed.draftListingId,
      await solidImage({ width: 300, height: 300, format: 'png' }),
      { purpose: 'LOGO' },
    )
    const res = await testApp()
      .get(`/api/v1/partner/listings/${seed.draftListingId}`)
      .set('x-test-auth', auth())
    const detail = partnerListingDetail.parse(res.body)
    expect(detail.media.map((m) => m.purpose)).toEqual(['LOGO', 'PHOTO'])
  })
})

describe('captions, order and delete', () => {
  const photo = async (listingId = seed.draftListingId) =>
    mediaAsset.parse((await upload(listingId, jpeg)).body)
  const send = (
    method: 'patch' | 'put' | 'delete',
    path: string,
    body?: object,
    org = 'co_alpha',
  ) => {
    const req = testApp()[method](`/api/v1/partner${path}`).set('x-test-auth', auth(org))
    return body ? req.send(body) : req
  }
  const order = (listingId: string) =>
    prisma.mediaAsset
      .findMany({ where: { listingId, purpose: 'PHOTO' }, orderBy: { sortOrder: 'asc' } })
      .then((rows) => rows.map((r) => r.id))

  it('saves and clears alt text', async () => {
    const asset = await photo()
    const saved = await send('patch', `/media/${asset.id}`, { alt: '  Results board  ' })
    expect(saved.status).toBe(200)
    expect(mediaAsset.parse(saved.body).alt).toBe('Results board')
    const cleared = await send('patch', `/media/${asset.id}`, { alt: null })
    expect(mediaAsset.parse(cleared.body).alt).toBeNull()
  })

  it('reorders photos', async () => {
    const [a, b, c] = [await photo(), await photo(), await photo()]
    const res = await send('put', `/listings/${seed.draftListingId}/media/order`, {
      assetIds: [c!.id, a!.id, b!.id],
    })
    expect(res.status).toBe(200)
    expect(await order(seed.draftListingId)).toEqual([c!.id, a!.id, b!.id])
  })

  it('400s an order missing a photo', async () => {
    const [a, b] = [await photo(), await photo()]
    const res = await send('put', `/listings/${seed.draftListingId}/media/order`, {
      assetIds: [b!.id],
    })
    expect(res.status).toBe(400)
    expect(await order(seed.draftListingId)).toEqual([a!.id, b!.id])
  })

  it('400s an order repeating a photo', async () => {
    const [a, b] = [await photo(), await photo()]
    const res = await send('put', `/listings/${seed.draftListingId}/media/order`, {
      assetIds: [a!.id, a!.id],
    })
    expect(res.status).toBe(400)
    expect(await order(seed.draftListingId)).toEqual([a!.id, b!.id])
  })

  it("400s an order containing another listing's photo", async () => {
    const [a, b] = [await photo(), await photo()]
    const foreign = await photo(seed.publishedListingId)
    const res = await send('put', `/listings/${seed.draftListingId}/media/order`, {
      assetIds: [b!.id, foreign.id],
    })
    expect(res.status).toBe(400)
    expect(await order(seed.draftListingId)).toEqual([a!.id, b!.id])
  })

  it('deletes a photo and its objects (204)', async () => {
    const asset = await photo()
    const res = await send('delete', `/media/${asset.id}`)
    expect(res.status).toBe(204)
    expect(await prisma.mediaAsset.count({ where: { id: asset.id } })).toBe(0)
    expect(await filesUnder(seed.draftListingId)).toEqual([])
  })

  it('still deletes the row when object deletion fails', async () => {
    const asset = await photo()
    // Make deletion fail for real: a directory where the variant file was.
    const file = join(root, new URL(asset.thumbUrl!).pathname.replace(/^\/media\//, ''))
    const { rm, mkdir, writeFile } = await import('node:fs/promises')
    await rm(file)
    await mkdir(file)
    await writeFile(join(file, 'blocker'), 'x')
    const res = await send('delete', `/media/${asset.id}`)
    expect(res.status).toBe(204)
    expect(await prisma.mediaAsset.count({ where: { id: asset.id } })).toBe(0)
  })

  it('404s an unknown asset', async () => {
    expect((await send('patch', '/media/nope', { alt: 'x' })).status).toBe(404)
  })

  it("403s another organisation's asset", async () => {
    const asset = await photo()
    expect((await send('delete', `/media/${asset.id}`, undefined, 'co_beta')).status).toBe(403)
    expect(await prisma.mediaAsset.count({ where: { id: asset.id } })).toBe(1)
  })

  it.each(['patch', 'put', 'delete'] as const)('409s %s while in review', async (method) => {
    const asset = await photo()
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    const res =
      method === 'put'
        ? await send('put', `/listings/${seed.draftListingId}/media/order`, {
            assetIds: [asset.id],
          })
        : await send(method, `/media/${asset.id}`, method === 'patch' ? { alt: 'x' } : undefined)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LISTING_UNDER_REVIEW')
    expect(await prisma.mediaAsset.count({ where: { id: asset.id } })).toBe(1)
  })
})

describe('media changes are moderated like text (BR-018)', () => {
  const asAdmin = JSON.stringify({ userId: 'u-admin', globalRole: 'ADMIN' })
  const adminDetail = async (id: string) =>
    (await testApp().get(`/api/v1/admin/listings/${id}`).set('x-test-auth', asAdmin)).body

  it('flags a published listing when a photo is added', async () => {
    const asset = mediaAsset.parse((await upload(seed.publishedListingId, jpeg)).body)
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.publishedListingId } })
    expect(row.changedSinceReviewAt).toBeInstanceOf(Date)
    expect((await adminDetail(seed.publishedListingId)).changes).toEqual([
      { field: 'photos', before: [], after: [asset.id] },
    ])
  })

  it('does not flag a never-published draft', async () => {
    await upload(seed.draftListingId, jpeg)
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: seed.draftListingId } })
    expect(row.changedSinceReviewAt).toBeNull()
  })

  it('flags a reorder', async () => {
    const a = mediaAsset.parse((await upload(seed.publishedListingId, jpeg)).body)
    const b = mediaAsset.parse((await upload(seed.publishedListingId, jpeg)).body)
    // Approve the two photos, then swap them.
    const detail = await adminDetail(seed.publishedListingId)
    await testApp()
      .post(`/api/v1/admin/listings/${seed.publishedListingId}/mark-reviewed`)
      .set('x-test-auth', asAdmin)
      .send({ changedSinceReviewAt: detail.changedSinceReviewAt })
    await testApp()
      .put(`/api/v1/partner/listings/${seed.publishedListingId}/media/order`)
      .set('x-test-auth', auth())
      .send({ assetIds: [b.id, a.id] })
    expect((await adminDetail(seed.publishedListingId)).changes).toEqual([
      { field: 'photos', before: [a.id, b.id], after: [b.id, a.id] },
    ])
  })
})
