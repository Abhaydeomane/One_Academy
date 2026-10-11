import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb, seedMinimal } from './helpers/db.js'
import { testApp } from './helpers/app.js'

describe('test harness', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('serves /health', async () => {
    const res = await testApp().get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('seeds one published and one draft listing against a real database', async () => {
    const seed = await seedMinimal()
    expect(await prisma.listing.count({ where: { status: 'PUBLISHED' } })).toBe(1)
    expect(await prisma.listing.count({ where: { status: 'DRAFT' } })).toBe(1)
    expect(seed.publishedSlug).toBe('alpha-academy')
  })

  it('truncates between tests', async () => {
    expect(await prisma.listing.count()).toBe(0)
  })
})
