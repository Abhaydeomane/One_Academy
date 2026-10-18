import { config } from './config/index.js'
import { logger } from './lib/logger.js'
import { createServer } from './server.js'

// Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead of
// throwing, so an unchecked callback would log success and then exit silently.
createServer().listen(config.port, (error) => {
  if (error) {
    logger.fatal({ err: error, port: config.port }, 'API failed to start')
    process.exit(1)
  }
  logger.info({ port: config.port, env: config.nodeEnv }, 'API listening')
})
