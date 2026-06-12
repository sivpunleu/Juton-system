import assert from 'node:assert/strict'
import test from 'node:test'
import bcrypt from 'bcryptjs'
import {
  createAdminToken,
  decodeTokenExpiration,
  verifyAdminCredentials,
  verifyAdminToken,
} from '../services/authService.js'

const createConfig = async () => ({
  username: 'admin',
  passwordHash: await bcrypt.hash('StrongPassword123!', 4),
  jwtSecret: 'test-secret-that-is-long-enough-for-authentication',
  jwtExpiresIn: '1h',
  isConfigured: true,
})

test('verifyAdminCredentials accepts the configured admin', async () => {
  const config = await createConfig()
  const result = await verifyAdminCredentials(
    'ADMIN',
    'StrongPassword123!',
    config,
  )
  assert.equal(result, true)
})

test('verifyAdminCredentials rejects an incorrect password', async () => {
  const config = await createConfig()
  const result = await verifyAdminCredentials('admin', 'wrong-password', config)
  assert.equal(result, false)
})

test('admin JWT contains the expected identity and expiration', async () => {
  const config = await createConfig()
  const token = createAdminToken(config.username, config)
  const payload = verifyAdminToken(token, config)

  assert.equal(payload.sub, 'admin')
  assert.equal(payload.username, 'admin')
  assert.equal(payload.role, 'admin')
  assert.ok(decodeTokenExpiration(token))
})

test('admin JWT preserves database identity and role', async () => {
  const config = await createConfig()
  const token = createAdminToken(
    {
      id: 'admin-id-1',
      username: 'owner',
      displayName: 'Billing Owner',
      role: 'owner',
    },
    config,
  )
  const payload = verifyAdminToken(token, config)

  assert.equal(payload.sub, 'admin-id-1')
  assert.equal(payload.adminId, 'admin-id-1')
  assert.equal(payload.username, 'owner')
  assert.equal(payload.role, 'owner')
})
