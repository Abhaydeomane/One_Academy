import pino from 'pino'
import { config } from '../config/index.js'

export const logger = pino({
  level: config.isTest ? 'silent' : config.isProduction ? 'info' : 'debug',
  ...(config.isProduction ? {} : { transport: { target: 'pino-pretty' } }),
})
