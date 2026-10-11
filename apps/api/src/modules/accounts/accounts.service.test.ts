import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb } from '../../../test/helpers/db.js'
import { resolveLocalOrgId, syncOrganization, syncUser } from './accounts.service.js'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('syncUser', () => {
  it('creates a local user on first sight', async () => {
    const id = await syncUser({ clerkUserId: 'cu_1', email: 'a@test.local', name: 'A' })
    const user = await prisma.user.findUniqueOrThrow({ where: { id } })
    expect(user.clerkUserId).toBe('cu_1')
  })

  it('is idempotent for the same Clerk id', async () => {
    const first = await syncUser({ clerkUserId: 'cu_1', email: 'a@test.local' })
    const second = await syncUser({ clerkUserId: 'cu_1', email: 'a@test.local', name: 'Renamed' })
    expect(second).toBe(first)
    expect(await prisma.user.count()).toBe(1)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: first } })).name).toBe('Renamed')
  })

  it('links an existing email-only user to a Clerk id', async () => {
    const existing = await prisma.user.create({ data: { email: 'a@test.local' } })
    const id = await syncUser({ clerkUserId: 'cu_1', email: 'a@test.local' })
    expect(id).toBe(existing.id)
  })

  it('never downgrades an existing ADMIN role', async () => {
    const admin = await prisma.user.create({
      data: { email: 'a@test.local', clerkUserId: 'cu_1', globalRole: 'ADMIN' },
    })
    await syncUser({ clerkUserId: 'cu_1', email: 'a@test.local' })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).globalRole).toBe(
      'ADMIN',
    )
  })
})

describe('syncOrganization and resolveLocalOrgId', () => {
  it('creates and then resolves an organisation', async () => {
    const id = await syncOrganization({ clerkOrgId: 'co_1', name: 'Alpha', slug: 'alpha' })
    expect(await resolveLocalOrgId('co_1')).toBe(id)
  })

  it('is idempotent', async () => {
    const first = await syncOrganization({ clerkOrgId: 'co_1', name: 'Alpha', slug: 'alpha' })
    const second = await syncOrganization({
      clerkOrgId: 'co_1',
      name: 'Alpha Renamed',
      slug: 'alpha',
    })
    expect(second).toBe(first)
    expect(await prisma.organization.count()).toBe(1)
  })

  it('adopts an existing organisation that has no Clerk id yet', async () => {
    const existing = await prisma.organization.create({ data: { name: 'Seeded', slug: 'seeded' } })
    const id = await syncOrganization({ clerkOrgId: 'co_2', name: 'Seeded', slug: 'seeded' })
    expect(id).toBe(existing.id)
  })

  it('forbids an unknown Clerk organisation', async () => {
    await expect(resolveLocalOrgId('co_missing')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
