import request from 'supertest'
import { createServer } from '../../src/server.js'

export function testApp() {
  return request(createServer())
}
