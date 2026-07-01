import rateLimit from 'express-rate-limit'
import helmet from 'helmet'

const toPositiveInteger = (value, fallback) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : fallback
}

export const securityHeaders = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'no-referrer' },
})

export const apiRateLimit = rateLimit({
  windowMs: toPositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  limit: toPositiveInteger(process.env.RATE_LIMIT_MAX, 600),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  message: {
    message: 'Too many requests. Please try again later',
  },
})
