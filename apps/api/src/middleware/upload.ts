import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { MEDIA_LIMITS } from '@one/shared'
import { BadRequestError, MediaInvalidError } from '../lib/errors.js'

// R2: multer stays here, so services receive a Buffer and never see Express.
const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDIA_LIMITS.maxBytes, files: 1, fields: 5 },
}).single('file')

/// Parses one `file` part into memory (8 MB cap) and the text fields into
/// req.body. Multer's errors become AppErrors so errorHandler maps them (R6).
export function uploadSingleImage(req: Request, res: Response, next: NextFunction) {
  single(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(
        error.code === 'LIMIT_FILE_SIZE'
          ? new MediaInvalidError('TOO_LARGE', 'That photo is over 8 MB')
          : new BadRequestError(error.message),
      )
      return
    }
    if (error) {
      next(error)
      return
    }
    if (!req.file) {
      next(new BadRequestError('A file is required'))
      return
    }
    req.body ??= {}
    next()
  })
}
