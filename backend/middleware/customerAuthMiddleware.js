import { getAuthConfig } from '../config/auth.js'
import { findCustomerAccountById } from '../repositories/customerAccountRepository.js'
import { verifyCustomerToken } from '../services/authService.js'

export const requireCustomer = async (req, res, next) => {
  const authConfig = getAuthConfig()
  if (!authConfig.hasJwtSecret) {
    return res.status(503).json({
      message: 'Customer authentication is not configured on the server',
    })
  }

  const authorization = String(req.headers.authorization || '')
  const [scheme, token] = authorization.split(' ')
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Customer authentication is required' })
  }

  try {
    const payload = verifyCustomerToken(token, authConfig)
    const account = await findCustomerAccountById(payload.customerAccountId)
    if (!account || !account.active) {
      return res.status(403).json({ message: 'This customer account is unavailable' })
    }
    req.customer = {
      accountId: String(account.id),
      customerId: String(account.customerId),
      username: account.username,
    }
    return next()
  } catch (error) {
    const message =
      error.name === 'TokenExpiredError'
        ? 'Your customer session has expired'
        : 'Invalid customer authentication token'
    return res.status(401).json({ message })
  }
}
