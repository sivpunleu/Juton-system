import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const TOKEN_ISSUER = 'jotun-billing-api'
const TOKEN_AUDIENCE = 'jotun-billing-admin'

export const verifyPasswordHash = (password, passwordHash) =>
  bcrypt.compare(String(password || ''), String(passwordHash || ''))

export const hashPassword = (password) =>
  bcrypt.hash(String(password || ''), 12)

export const verifyAdminCredentials = async (
  username,
  password,
  authConfig,
) => {
  const normalizedUsername = String(username || '').trim().toLowerCase()
  const configuredUsername = authConfig.username.toLowerCase()
  const passwordMatches = await verifyPasswordHash(
    password,
    authConfig.passwordHash,
  )

  return normalizedUsername === configuredUsername && passwordMatches
}

export const createAdminToken = (adminOrUsername, authConfig) => {
  const admin =
    typeof adminOrUsername === 'string'
      ? {
          id: '',
          username: adminOrUsername,
          role: 'admin',
        }
      : adminOrUsername

  return jwt.sign(
    {
      adminId: String(admin.id || ''),
      username: admin.username,
      displayName: admin.displayName || '',
      role: admin.role || 'admin',
    },
    authConfig.jwtSecret,
    {
      subject: String(admin.id || admin.username || 'admin'),
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      expiresIn: authConfig.jwtExpiresIn,
    },
  )
}

export const verifyAdminToken = (token, authConfig) =>
  jwt.verify(token, authConfig.jwtSecret, {
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  })

export const decodeTokenExpiration = (token) => {
  const payload = jwt.decode(token)
  return payload?.exp ? new Date(payload.exp * 1000).toISOString() : null
}
