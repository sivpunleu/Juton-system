import assert from 'node:assert/strict'
import test from 'node:test'
import bcrypt from 'bcryptjs'
import { getAuthConfig } from '../config/auth.js'

const AUTH_ENV_KEYS = [
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD_HASH',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
]

const withAuthEnvironment = async (values, callback) => {
  const originalValues = Object.fromEntries(
    AUTH_ENV_KEYS.map((key) => [key, process.env[key]]),
  )

  Object.assign(process.env, values)

  try {
    await callback()
  } finally {
    AUTH_ENV_KEYS.forEach((key) => {
      if (originalValues[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalValues[key]
      }
    })
  }
}

test('auth config accepts a bcrypt hash and strong JWT secret', async () => {
  const passwordHash = await bcrypt.hash('StrongPassword123!', 4)

  await withAuthEnvironment(
    {
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD_HASH: passwordHash,
      JWT_SECRET: 'a-secret-with-at-least-thirty-two-characters',
      JWT_EXPIRES_IN: '2h',
    },
    () => {
      const config = getAuthConfig()
      assert.equal(config.isConfigured, true)
      assert.equal(config.jwtExpiresIn, '2h')
    },
  )
})

test('auth config rejects placeholder or weak secrets', async () => {
  await withAuthEnvironment(
    {
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD_HASH: 'replace-with-bcrypt-hash',
      JWT_SECRET: 'too-short',
      JWT_EXPIRES_IN: '',
    },
    () => {
      const config = getAuthConfig()
      assert.equal(config.isConfigured, false)
      assert.equal(config.jwtExpiresIn, '8h')
    },
  )
})
