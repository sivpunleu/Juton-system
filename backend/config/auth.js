const DEFAULT_TOKEN_LIFETIME = '8h'
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/
const MINIMUM_JWT_SECRET_LENGTH = 32

export const getAuthConfig = () => {
  const username = String(process.env.ADMIN_USERNAME || '').trim()
  const passwordHash = String(process.env.ADMIN_PASSWORD_HASH || '').trim()
  const jwtSecret = String(process.env.JWT_SECRET || '').trim()
  const jwtExpiresIn =
    String(process.env.JWT_EXPIRES_IN || '').trim() || DEFAULT_TOKEN_LIFETIME
  const hasValidPasswordHash = BCRYPT_HASH_PATTERN.test(passwordHash)
  const hasStrongJwtSecret = jwtSecret.length >= MINIMUM_JWT_SECRET_LENGTH

  return {
    username,
    passwordHash,
    jwtSecret,
    jwtExpiresIn,
    hasJwtSecret: hasStrongJwtSecret,
    hasBootstrapAdmin: Boolean(username && hasValidPasswordHash),
    isConfigured: Boolean(
      username && hasValidPasswordHash && hasStrongJwtSecret,
    ),
  }
}
