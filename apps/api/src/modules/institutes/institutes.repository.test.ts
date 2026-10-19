import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@one/db'
import { resetDb, seedMinimal, type MinimalSeed } from '../../../test/helpers/db.js'
import { updateListingAndProfile } from './institutes.repository.js'

let seed: MinimalSeed

beforeEach(async () => {
  await resetDb()
  seed = await seedMinimal()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('updateListingAndProfile (BR-017)', () => {
  // The service checks the status first; this guard covers a submit that lands
  // between that check and the write.
  it('writes nothing to a listing that is in review', async () => {
    await prisma.listing.update({
      where: { id: seed.draftListingId },
      data: { status: 'PENDING_REVIEW' },
    })
    const before = await prisma.listing.findUniqueOrThrow({
      where: { id: seed.draftListingId },
      include: { instituteProfile: true },
    })

    const written = await updateListingAndProfile(
      seed.draftListingId,
      { shortDescription: 'Changed during review' },
      { about: 'Changed during review' },
    )

    expect(written).toBe(false)
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: seed.draftListingId },
      include: { instituteProfile: true },
    })
    expect(after.shortDescription).toBe(before.shortDescription)
    expect(after.instituteProfile?.about ?? null).toBe(before.instituteProfile?.about ?? null)
  })

  it('writes to a listing that is not in review', async () => {
    const written = await updateListingAndProfile(
      seed.draftListingId,
      { shortDescription: 'Updated' },
      { about: 'Updated about' },
    )
    expect(written).toBe(true)
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: seed.draftListingId },
      include: { instituteProfile: true },
    })
    expect(after.shortDescription).toBe('Updated')
    expect(after.instituteProfile?.about).toBe('Updated about')
  })
})
