import { randomUUID } from 'node:crypto'
import { getStorageMode } from '../config/database.js'
import Admin from '../models/Admin.js'
import { asPlainObject } from '../models/modelHelpers.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

const withoutPassword = (admin) => {
  if (!admin) return null
  const plain = asPlainObject(admin)
  const { passwordHash: _passwordHash, ...safeAdmin } = plain
  return safeAdmin
}

export const findAdminByUsername = async (
  username,
  { includePassword = false } = {},
) => {
  const normalized = String(username || '').trim().toLowerCase()
  if (getStorageMode() === 'mysql') {
    return Admin.findOne({
      where: { username: normalized },
      ...(!includePassword ? { attributes: { exclude: ['passwordHash'] } } : {}),
    })
  }
  const admins = await readLocalCollection('admins')
  const admin =
    admins.find((item) => item.username.toLowerCase() === normalized) || null
  return includePassword ? admin : withoutPassword(admin)
}

export const findAdminById = async (id) => {
  if (getStorageMode() === 'mysql') {
    return Admin.findByPk(id, { attributes: { exclude: ['passwordHash'] } })
  }
  const admins = await readLocalCollection('admins')
  return withoutPassword(
    admins.find((item) => String(item.id) === String(id)) || null,
  )
}

export const createAdmin = async (payload) => {
  if (getStorageMode() === 'mysql') {
    return Admin.create(payload)
  }
  return mutateLocalCollection('admins', (admins) => {
    if (
      admins.some(
        (item) =>
          item.username.toLowerCase() === payload.username.toLowerCase(),
      )
    ) {
      const error = new Error('Username already exists')
      error.code = 11000
      throw error
    }
    const timestamp = new Date().toISOString()
    const admin = {
      ...payload,
      username: payload.username.toLowerCase(),
      id: randomUUID(),
      active: payload.active ?? true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    admins.push(admin)
    return withoutPassword(admin)
  })
}

export const listAdmins = async () => {
  if (getStorageMode() === 'mysql') {
    return Admin.findAll({
      attributes: { exclude: ['passwordHash'] },
      order: [['createdAt', 'ASC']],
    })
  }
  const admins = await readLocalCollection('admins')
  return admins
    .map(withoutPassword)
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))
}

export const updateAdmin = async (id, payload) => {
  if (getStorageMode() === 'mysql') {
    const admin = await Admin.findByPk(id)
    if (!admin) return null
    await admin.update(payload)
    return withoutPassword(admin)
  }
  return mutateLocalCollection('admins', (admins) => {
    const index = admins.findIndex((item) => String(item.id) === String(id))
    if (index === -1) return null
    admins[index] = {
      ...admins[index],
      ...payload,
      updatedAt: new Date().toISOString(),
    }
    return withoutPassword(admins[index])
  })
}

export const updateAdminPassword = async (id, passwordHash) =>
  updateAdmin(id, { passwordHash })

export const recordAdminLogin = async (id) => {
  if (!id) return null
  return updateAdmin(id, { lastLoginAt: new Date() })
}

export const getAllAdminsForBackup = async () => {
  if (getStorageMode() === 'mysql') {
    return Admin.findAll({
      attributes: { exclude: ['passwordHash'] },
      raw: true,
    })
  }
  return (await readLocalCollection('admins')).map(withoutPassword)
}
