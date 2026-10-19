import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { config } from '../config/index.js'

/// The API's only access to stored media, as lib/clerk.ts is for Clerk.
/// Rows hold keys, not URLs, so changing provider or CDN is configuration.

export const IMMUTABLE = 'public, max-age=31536000, immutable'

export type StorageDriver = {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>
  deleteObjects(keys: string[]): Promise<void>
}

export type S3Settings = {
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

/// Local development and tests: real files, served by the API at /media.
export function createFsDriver(root: string): StorageDriver {
  const base = resolve(root)
  const path = (key: string) => {
    const full = resolve(join(base, key))
    if (!full.startsWith(base + '/')) throw new Error(`Storage key escapes the root: ${key}`)
    return full
  }
  return {
    async putObject(key, body) {
      await mkdir(dirname(path(key)), { recursive: true })
      await writeFile(path(key), body)
    },
    async deleteObjects(keys) {
      await Promise.all(keys.map((key) => rm(path(key), { force: true })))
    },
  }
}

/// Any S3-compatible store: AWS S3, Cloudflare R2, MinIO.
export function createS3Driver(settings: S3Settings): StorageDriver {
  const client = new S3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  })
  return {
    async putObject(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: settings.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: IMMUTABLE,
        }),
      )
    },
    async deleteObjects(keys) {
      if (keys.length === 0) return
      await client.send(
        new DeleteObjectsCommand({
          Bucket: settings.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      )
    },
  }
}

const driver: StorageDriver =
  config.storage.driver === 's3' && config.storage.s3
    ? createS3Driver(config.storage.s3)
    : createFsDriver(config.storage.fsRoot)

export const putObject = (key: string, body: Buffer, contentType: string) =>
  driver.putObject(key, body, contentType)

export const deleteObjects = (keys: string[]) => driver.deleteObjects(keys)

export const publicUrl = (key: string) => `${config.storage.publicBaseUrl}/${key}`
