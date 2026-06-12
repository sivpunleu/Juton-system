const attempts = new Map()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 8

const getClientKey = (req) =>
  req.ip || req.socket.remoteAddress || 'unknown'

export const loginRateLimit = (req, res, next) => {
  const key = getClientKey(req)
  const now = Date.now()
  const current = attempts.get(key)

  if (!current || now > current.resetAt) {
    attempts.delete(key)
    return next()
  }

  if (current.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    res.set('Retry-After', String(retryAfter))
    return res.status(429).json({
      message: 'Too many login attempts. Please try again later',
    })
  }

  return next()
}

export const recordLoginFailure = (req) => {
  const key = getClientKey(req)
  const now = Date.now()
  const current = attempts.get(key)

  if (!current || now > current.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }

  current.count += 1
  attempts.set(key, current)
}

export const clearLoginFailures = (req) => {
  attempts.delete(getClientKey(req))
}
