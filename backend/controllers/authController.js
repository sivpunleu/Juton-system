import { getAuthConfig } from '../config/auth.js'
import {
  createAdmin,
  findAdminById,
  findAdminByUsername,
  listAdmins,
  recordAdminLogin,
  updateAdmin,
  updateAdminPassword,
} from '../repositories/adminRepository.js'
import {
  listAuditLogs,
  writeAuditLog,
} from '../repositories/auditRepository.js'
import {
  createAdminToken,
  decodeTokenExpiration,
  hashPassword,
  verifyAdminCredentials,
  verifyPasswordHash,
} from '../services/authService.js'
import {
  clearLoginFailures,
  recordLoginFailure,
} from '../middleware/loginRateLimit.js'

const PASSWORD_MINIMUM_LENGTH = 10
const VALID_ROLES = ['owner', 'admin', 'viewer']
const AVATAR_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
const MAX_AVATAR_LENGTH = 350_000

const publicAdmin = (admin) => ({
  id: String(admin.id || ''),
  username: admin.username,
  displayName: admin.displayName || '',
  avatar: admin.avatar || '',
  role: admin.role,
  active: admin.active,
  lastLoginAt: admin.lastLoginAt || null,
  createdAt: admin.createdAt || null,
})

const validatePassword = (password) => {
  if (String(password || '').length < PASSWORD_MINIMUM_LENGTH) {
    throw new Error(
      `Password must contain at least ${PASSWORD_MINIMUM_LENGTH} characters`,
    )
  }
}

const getStoredAdminWithPassword = async (username) =>
  findAdminByUsername(username, { includePassword: true })

const bootstrapAdmin = async (username, password, authConfig) => {
  if (!authConfig.hasBootstrapAdmin) return null
  const isValid = await verifyAdminCredentials(
    username,
    password,
    authConfig,
  )
  if (!isValid) return null

  try {
    return await createAdmin({
      username: authConfig.username,
      displayName: authConfig.username,
      passwordHash: authConfig.passwordHash,
      role: 'owner',
      active: true,
      createdBy: 'environment-bootstrap',
    })
  } catch (error) {
    if (error.code !== 11000) throw error
    return getStoredAdminWithPassword(authConfig.username)
  }
}

export const loginAdmin = async (req, res) => {
  try {
    const authConfig = getAuthConfig()
    if (!authConfig.hasJwtSecret) {
      return res.status(503).json({
        message: 'Admin authentication is not configured on the server',
      })
    }

    const { username, password } = req.body || {}
    if (!username || !password) {
      return res.status(400).json({
        message: 'Username and password are required',
      })
    }

    let admin = await getStoredAdminWithPassword(username)
    if (admin) {
      const validPassword = await verifyPasswordHash(
        password,
        admin.passwordHash,
      )
      if (!validPassword || !admin.active) admin = null
    } else {
      admin = await bootstrapAdmin(username, password, authConfig)
    }

    if (!admin || !admin.active) {
      recordLoginFailure(req)
      return res.status(401).json({
        message: 'Invalid username or password',
      })
    }

    clearLoginFailures(req)
    await recordAdminLogin(admin.id)
    const safeAdmin = publicAdmin(admin)
    const token = createAdminToken(safeAdmin, authConfig)
    await writeAuditLog({
      actor: safeAdmin,
      action: 'login',
      entityType: 'admin',
      entityId: safeAdmin.id,
      summary: safeAdmin.username,
    })
    return res.json({
      token,
      expiresAt: decodeTokenExpiration(token),
      admin: safeAdmin,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Unable to sign in' })
  }
}

export const getCurrentAdmin = (req, res) => {
  res.json({ admin: req.admin })
}

export const getProfile = async (req, res) => {
  try {
    const admin = req.admin.id
      ? await findAdminById(req.admin.id)
      : await findAdminByUsername(req.admin.username)
    if (!admin) return res.status(404).json({ message: 'Profile not found' })
    res.json({ admin: publicAdmin(admin) })
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to load profile' })
  }
}

export const updateProfile = async (req, res) => {
  try {
    const admin = req.admin.id
      ? await findAdminById(req.admin.id)
      : await findAdminByUsername(req.admin.username)
    if (!admin) return res.status(404).json({ message: 'Profile not found' })

    const displayName = String(req.body.displayName || '').trim()
    const avatar = String(req.body.avatar || '').trim()
    if (displayName.length > 80) {
      throw new Error('Display name cannot exceed 80 characters')
    }
    if (
      avatar &&
      (!AVATAR_PATTERN.test(avatar) || avatar.length > MAX_AVATAR_LENGTH)
    ) {
      throw new Error('Profile image must be a small PNG, JPEG, or WebP image')
    }

    const updated = await updateAdmin(admin.id, {
      displayName,
      avatar,
    })
    await writeAuditLog({
      actor: req.admin,
      action: 'update_profile',
      entityType: 'admin',
      entityId: req.admin.id,
      summary: req.admin.username,
      details: { avatarUpdated: avatar !== String(admin.avatar || '') },
    })
    res.json({ admin: publicAdmin(updated) })
  } catch (error) {
    res.status(400).json({
      message: error.message || 'Unable to update profile',
    })
  }
}

export const getProfileActivity = async (req, res) => {
  try {
    const result = await listAuditLogs({
      page: req.query.page,
      limit: req.query.limit,
      actorId: req.admin.id,
      actorUsername: req.admin.username,
    })
    res.json({
      items: result.items,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: Math.max(1, Math.ceil(result.total / result.limit)),
      },
    })
  } catch (error) {
    res.status(400).json({
      message: error.message || 'Unable to load profile activity',
    })
  }
}

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {}
    validatePassword(newPassword)
    const admin = req.admin.id
      ? await findAdminById(req.admin.id)
      : await findAdminByUsername(req.admin.username)
    const adminWithPassword = await getStoredAdminWithPassword(
      admin?.username || req.admin.username,
    )
    if (
      !adminWithPassword ||
      !(await verifyPasswordHash(
        currentPassword,
        adminWithPassword.passwordHash,
      ))
    ) {
      return res.status(400).json({ message: 'Current password is incorrect' })
    }
    await updateAdminPassword(
      adminWithPassword.id,
      await hashPassword(newPassword),
    )
    await writeAuditLog({
      actor: req.admin,
      action: 'change_password',
      entityType: 'admin',
      entityId: req.admin.id,
      summary: req.admin.username,
    })
    res.json({ message: 'Password changed successfully' })
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to change password' })
  }
}

export const getAdmins = async (_req, res) => {
  try {
    res.json(await listAdmins())
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to load admins' })
  }
}

export const addAdmin = async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase()
    const displayName = String(req.body.displayName || '').trim()
    const role = VALID_ROLES.includes(req.body.role) ? req.body.role : 'admin'
    validatePassword(req.body.password)
    if (!username) throw new Error('Username is required')

    const admin = await createAdmin({
      username,
      displayName,
      role,
      active: true,
      passwordHash: await hashPassword(req.body.password),
      createdBy: req.admin.username,
    })
    await writeAuditLog({
      actor: req.admin,
      action: 'create',
      entityType: 'admin',
      entityId: admin.id,
      summary: username,
      details: { role },
    })
    res.status(201).json(admin)
  } catch (error) {
    const status = error.code === 11000 ? 409 : 400
    res.status(status).json({ message: error.message || 'Unable to create admin' })
  }
}

export const editAdmin = async (req, res) => {
  try {
    const existing = await findAdminById(req.params.id)
    if (!existing) return res.status(404).json({ message: 'Admin not found' })

    const payload = {}
    if (req.body.displayName !== undefined) {
      payload.displayName = String(req.body.displayName || '').trim()
    }
    if (req.body.role !== undefined) {
      if (!VALID_ROLES.includes(req.body.role)) {
        throw new Error('Invalid admin role')
      }
      payload.role = req.body.role
    }
    if (req.body.active !== undefined) {
      payload.active = Boolean(req.body.active)
    }
    if (req.body.password) {
      validatePassword(req.body.password)
      payload.passwordHash = await hashPassword(req.body.password)
    }
    if (
      String(existing.id) === String(req.admin.id) &&
      (payload.active === false || payload.role !== undefined)
    ) {
      throw new Error('You cannot disable or change your own role')
    }

    const admin = await updateAdmin(req.params.id, payload)
    await writeAuditLog({
      actor: req.admin,
      action: 'update',
      entityType: 'admin',
      entityId: req.params.id,
      summary: existing.username,
      details: {
        role: payload.role,
        active: payload.active,
        passwordReset: Boolean(payload.passwordHash),
      },
    })
    res.json(admin)
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to update admin' })
  }
}
