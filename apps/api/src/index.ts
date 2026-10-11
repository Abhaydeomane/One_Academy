import { config } from './config/index.js'
import { logger } from './lib/logger.js'
import { createServer } from './server.js'

createServer().listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'API listening')
})
