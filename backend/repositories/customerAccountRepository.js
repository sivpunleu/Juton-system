import { randomUUID } from 'node:crypto'
import { getStorageMode } from '../config/database.js'
import CustomerAccount from '../models/CustomerAccount.js'
import { asPlainObject } from '../models/modelHelpers.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

const withoutPassword = (account) => {
  if (!account) return null
  const plain = asPlainObject(account)
  const { passwordHash: _passwordHash, ...safeAccount } = plain
  return safeAccount
}

const normalizedUsername = (username) => String(username || '').trim().toLowerCase()

export const findCustomerAccountByUsername = async (
  username,
  { includePassword = false } = {},
) => {
  const value = normalizedUsername(username)
  if (getStorageMode() === 'mysql') {
    return CustomerAccount.findOne({
      where: { username: value },
      ...(!includePassword ? { attributes: { exclude: ['passwordHash'] } } : {}),
    })
  }
  const accounts = await readLocalCollection('customer-accounts')
  const account = accounts.find((item) => item.username === value) || null
  return includePassword ? account : withoutPassword(account)
}

export const findCustomerAccountById = async (
  id,
  { includePassword = false } = {},
) => {
  if (getStorageMode() === 'mysql') {
    return CustomerAccount.findByPk(id, {
      ...(!includePassword ? { attributes: { exclude: ['passwordHash'] } } : {}),
    })
  }
  const accounts = await readLocalCollection('customer-accounts')
  const account = accounts.find((item) => String(item.id) === String(id)) || null
  return includePassword ? account : withoutPassword(account)
}

export const createCustomerAccount = async (payload) => {
  if (getStorageMode() === 'mysql') return CustomerAccount.create(payload)

  return mutateLocalCollection('customer-accounts', (accounts) => {
    const username = normalizedUsername(payload.username)
    if (accounts.some((item) => item.username === username)) {
      const error = new Error('Username already exists')
      error.code = 11000
      throw error
    }
    const timestamp = new Date().toISOString()
    const account = {
      ...payload,
      id: randomUUID(),
      username,
      active: payload.active ?? true,
      lastLoginAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    accounts.push(account)
    return withoutPassword(account)
  })
}

export const recordCustomerLogin = async (id) => {
  if (!id) return null
  if (getStorageMode() === 'mysql') {
    const account = await CustomerAccount.findByPk(id)
    if (!account) return null
    await account.update({ lastLoginAt: new Date() })
    return withoutPassword(account)
  }
  return mutateLocalCollection('customer-accounts', (accounts) => {
    const account = accounts.find((item) => String(item.id) === String(id))
    if (!account) return null
    account.lastLoginAt = new Date().toISOString()
    account.updatedAt = account.lastLoginAt
    return withoutPassword(account)
  })
}

export const getAllCustomerAccountsForBackup = async () => {
  if (getStorageMode() === 'mysql') return CustomerAccount.findAll({ raw: true })
  return readLocalCollection('customer-accounts')
}
