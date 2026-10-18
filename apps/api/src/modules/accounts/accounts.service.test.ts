import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@one/db'
import { resetDb } from '../../../test/helpers/db.js'
import { resolveLocalOrgId, syncOrganization, syncUser } from './accounts.service.js'
import { fetchClerkOrganization } from '../../lib/clerk.js'

vi.mock('../../lib/clerk.js', () => ({ fetchClerkOrganization: vi.fn() }))
const fetchOrg = vi.mocked(fetchClerkOrganization)

beforeEach(async () => {
  await resetDb()
  fetchOrg.mockReset()
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

  it('never adopts an existing organisation by slug (account-takeover guard)', async () => {
    const existing = await prisma.organization.create({ data: { name: 'Seeded', slug: 'seeded' } })

    const id = await syncOrganization({ clerkOrgId: 'co_2', name: 'Seeded', slug: 'seeded' })

    expect(id).not.toBe(existing.id)
    const created = await prisma.organization.findUniqueOrThrow({ where: { id } })
    expect(created.slug).toBe('seeded-2')
    expect(
      (await prisma.organization.findUniqueOrThrow({ where: { id: existing.id } })).clerkOrgId,
    ).toBeNull()
  })

  it('suffixes past every taken slug', async () => {
    await prisma.organization.create({ data: { name: 'A', slug: 'alpha' } })
    await prisma.organization.create({ data: { name: 'A', slug: 'alpha-2' } })

    const id = await syncOrganization({ clerkOrgId: 'co_3', name: 'Alpha', slug: 'alpha' })
    expect((await prisma.organization.findUniqueOrThrow({ where: { id } })).slug).toBe('alpha-3')
  })
})

describe('on-demand provisioning', () => {
  it('creates an unknown organisation from Clerk', async () => {
    fetchOrg.mockResolvedValue({ id: 'co_new', name: 'Gamma Classes', slug: 'gamma-classes' })

    const id = await resolveLocalOrgId('co_new')

    const org = await prisma.organization.findUniqueOrThrow({ where: { id } })
    expect(org).toMatchObject({
      clerkOrgId: 'co_new',
      name: 'Gamma Classes',
      slug: 'gamma-classes',
    })
    expect(fetchOrg).toHaveBeenCalledWith('co_new')
  })

  it('does not call Clerk for a known organisation', async () => {
    const id = await syncOrganization({ clerkOrgId: 'co_1', name: 'Alpha', slug: 'alpha' })
    expect(await resolveLocalOrgId('co_1')).toBe(id)
    expect(fetchOrg).not.toHaveBeenCalled()
  })

  it('creates exactly one row when the webhook and a request race', async () => {
    fetchOrg.mockResolvedValue({ id: 'co_new', name: 'Gamma Classes', slug: 'gamma-classes' })

    const [fromWebhook, fromRequest] = await Promise.all([
      syncOrganization({ clerkOrgId: 'co_new', name: 'Gamma Classes', slug: 'gamma-classes' }),
      resolveLocalOrgId('co_new'),
    ])

    expect(fromRequest).toBe(fromWebhook)
    expect(await prisma.organization.count()).toBe(1)
  })

  it('falls back to a slug from the Clerk id for a non-Latin name', async () => {
    fetchOrg.mockResolvedValue({ id: 'co_Hindi1', name: 'ज्ञान अकादमी', slug: null })
    const id = await resolveLocalOrgId('co_Hindi1')
    expect((await prisma.organization.findUniqueOrThrow({ where: { id } })).slug).toBe(
      'org-co-hindi1',
    )
  })

  it('is FORBIDDEN and writes nothing when Clerk does not know the organisation', async () => {
    fetchOrg.mockResolvedValue(null)
    await expect(resolveLocalOrgId('co_missing')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    })
    expect(await prisma.organization.count()).toBe(0)
  })

  it('is UPSTREAM_UNAVAILABLE and writes nothing when Clerk fails', async () => {
    fetchOrg.mockRejectedValue(new Error('network down'))
    await expect(resolveLocalOrgId('co_new')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      status: 503,
    })
    expect(await prisma.organization.count()).toBe(0)
  })
})
