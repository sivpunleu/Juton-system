import { getAuthConfig } from '../config/auth.js'
import {
  findAdminById,
  findAdminByUsername,
} from '../repositories/adminRepository.js'
import { verifyAdminToken } from '../services/authService.js'

export const requireAdmin = async (req, res, next) => {
  const authConfig = getAuthConfig()
  if (!authConfig.hasJwtSecret) {
    return res.status(503).json({
      message: 'Admin authentication is not configured on the server',
    })
  }

  const authorization = String(req.headers.authorization || '')
  const [scheme, token] = authorization.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication is required' })
  }

  try {
    const payload = verifyAdminToken(token, authConfig)
    const storedAdmin = payload.adminId
      ? await findAdminById(payload.adminId)
      : await findAdminByUsername(payload.username)

    if (storedAdmin && !storedAdmin.active) {
      return res.status(403).json({ message: 'This admin account is disabled' })
    }

    req.admin = {
      id: String(storedAdmin?.id || payload.adminId || ''),
      username: storedAdmin?.username || payload.username,
      displayName: storedAdmin?.displayName || payload.displayName || '',
      role: storedAdmin?.role || payload.role || 'viewer',
    }
    return next()
  } catch (error) {
    const message =
      error.name === 'TokenExpiredError'
        ? 'Your session has expired'
        : 'Invalid authentication token'
    return res.status(401).json({ message })
  }
}

export const authorizeRoles =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.admin?.role)) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action',
      })
    }
    return next()
  }
