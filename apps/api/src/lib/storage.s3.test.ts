import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { describe, expect, it } from 'vitest'
import { createS3Driver } from './storage.js'

// Runs only against a real S3-compatible endpoint (MinIO locally; see the
// runbook). The fs driver covers the pipeline everywhere else.
const endpoint = process.env.S3_TEST_ENDPOINT
if (!endpoint) console.info('storage.s3.test: skipped (set S3_TEST_ENDPOINT to run)')

describe.skipIf(!endpoint)('storage (s3 driver)', () => {
  it('puts, reads back and deletes an object', async () => {
    const s3 = {
      endpoint: endpoint!,
      bucket: process.env.S3_BUCKET!,
      region: process.env.S3_REGION ?? 'auto',
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    }
    const { putObject, deleteObjects } = createS3Driver(s3)
    const client = new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? 'auto',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    })
    const key = `listings/s3-test/${Date.now()}`
    await putObject(key, Buffer.from('s3-bytes'), 'text/plain')
    const got = await client.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }),
    )
    expect(await got.Body?.transformToString()).toBe('s3-bytes')
    await deleteObjects([key])
  })
})
