import { getAuthConfig } from '../config/auth.js'
import { writeAuditLog } from '../repositories/auditRepository.js'
import {
  createCatalogRecord,
  findCatalogRecord,
  listCatalogRecords,
} from '../repositories/catalogRepository.js'
import {
  createCustomerAccount,
  findCustomerAccountById,
  findCustomerAccountByUsername,
  recordCustomerLogin,
} from '../repositories/customerAccountRepository.js'
import { createOrderFromCart, listOrders } from '../repositories/orderRepository.js'
import {
  createCustomerToken,
  hashPassword,
  verifyPasswordHash,
} from '../services/authService.js'
import { clearLoginFailures, recordLoginFailure } from '../middleware/loginRateLimit.js'
import { sendDatabaseError } from '../utils/databaseError.js'

const USERNAME_PATTERN = /^[a-z0-9._-]{3,40}$/
const PASSWORD_MINIMUM_LENGTH = 10
const PASSWORD_COMPLEXITY_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/

const publicAccount = (account, customer) => ({
  id: String(account.id || ''),
  customerId: String(account.customerId || ''),
  username: account.username,
  name: customer?.name || '',
  phone: customer?.phone || '',
  address: customer?.address || '',
})

const validateCredentials = ({ username, password }) => {
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(
      'Username must be 3-40 characters and use letters, numbers, dot, underscore, or dash only',
    )
  }
  if (String(password || '').length < PASSWORD_MINIMUM_LENGTH) {
    throw new Error(`Password must contain at least ${PASSWORD_MINIMUM_LENGTH} characters`)
  }
  if (!PASSWORD_COMPLEXITY_PATTERN.test(String(password || ''))) {
    throw new Error('Password must include uppercase, lowercase, number, and symbol')
  }
}

const customerForAccount = async (account) => {
  if (!account?.customerId) return null
  return findCatalogRecord('customers', account.customerId)
}

const customerSessionResponse = (account, customer) => {
  const authConfig = getAuthConfig()
  return {
    token: createCustomerToken(account, authConfig),
    customer: publicAccount(account, customer),
  }
}

const sendError = (res, error) => sendDatabaseError(res, error, 'Request failed')

export const registerCustomer = async (req, res) => {
  try {
    const authConfig = getAuthConfig()
    if (!authConfig.hasJwtSecret) {
      return res.status(503).json({
        message: 'Customer authentication is not configured on the server',
      })
    }
    const username = String(req.body?.username || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const name = String(req.body?.name || '').trim()
    const phone = String(req.body?.phone || '').trim()
    const address = String(req.body?.address || '').trim()
    validateCredentials({ username, password })
    if (!name) throw new Error('Name is required')
    if (!phone) throw new Error('Phone number is required')
    if (await findCustomerAccountByUsername(username)) {
      const error = new Error('Username already exists')
      error.code = 11000
      throw error
    }

    const customer = await createCatalogRecord('customers', {
      name,
      phone,
      address,
      notes: '',
      createdBy: `customer:${username}`,
      updatedBy: `customer:${username}`,
    })
    const account = await createCustomerAccount({
      customerId: customer.id,
      username,
      passwordHash: await hashPassword(password),
      active: true,
    })
    await writeAuditLog({
      actor: { id: account.id, username: `customer:${account.username}` },
      action: 'register',
      entityType: 'customer_account',
      entityId: account.id,
      summary: account.username,
    })
    res.status(201).json(customerSessionResponse(account, customer))
  } catch (error) {
    sendError(res, error)
  }
}

export const loginCustomer = async (req, res) => {
  try {
    const authConfig = getAuthConfig()
    if (!authConfig.hasJwtSecret) {
      return res.status(503).json({
        message: 'Customer authentication is not configured on the server',
      })
    }
    const username = String(req.body?.username || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' })
    }
    const account = await findCustomerAccountByUsername(username, {
      includePassword: true,
    })
    if (!account || !account.active || !(await verifyPasswordHash(password, account.passwordHash))) {
      recordLoginFailure(req)
      return res.status(401).json({ message: 'Invalid username or password' })
    }
    const customer = await customerForAccount(account)
    if (!customer) return res.status(403).json({ message: 'Customer profile is unavailable' })
    clearLoginFailures(req)
    const updated = await recordCustomerLogin(account.id)
    await writeAuditLog({
      actor: { id: account.id, username: `customer:${account.username}` },
      action: 'login',
      entityType: 'customer_account',
      entityId: account.id,
      summary: account.username,
    })
    return res.json(customerSessionResponse(updated || account, customer))
  } catch (error) {
    return sendError(res, error)
  }
}

export const getCurrentCustomer = async (req, res) => {
  try {
    const account = await findCustomerAccountById(req.customer.accountId)
    const customer = await customerForAccount(account)
    if (!account || !customer) return res.status(404).json({ message: 'Customer profile not found' })
    return res.json({ customer: publicAccount(account, customer) })
  } catch (error) {
    return sendError(res, error)
  }
}

export const getShopProducts = async (req, res) => {
  try {
    const result = await listCatalogRecords('products', {
      search: String(req.query.search || '').trim(),
      page: req.query.page,
      limit: req.query.limit || 24,
    })
    return res.json({
      items: result.items.map((product) => ({
        id: product.id,
        name: product.name,
        itemCode: product.itemCode || '',
        colorCode: product.colorCode || '',
        unit: product.unit,
        unitPrice: Number(product.unitPrice || 0),
        inStock: Number(product.stockQuantity || 0) > 0,
      })),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: Math.max(1, Math.ceil(result.total / result.limit)),
      },
    })
  } catch (error) {
    return sendError(res, error)
  }
}

export const createShopOrder = async (req, res) => {
  try {
    const account = await findCustomerAccountById(req.customer.accountId)
    const customerRecord = await customerForAccount(account)
    if (!account || !customerRecord) {
      return res.status(404).json({ message: 'Customer profile not found' })
    }
    const deliveryAddress = String(req.body?.deliveryAddress || '').trim()
    const order = await createOrderFromCart({
      customer: {
        accountId: account.id,
        customerId: customerRecord.id,
        name: customerRecord.name,
        phone: customerRecord.phone,
        address: deliveryAddress || customerRecord.address,
      },
      items: req.body?.items,
      customerNote: req.body?.customerNote,
    })
    await writeAuditLog({
      actor: { id: account.id, username: `customer:${account.username}` },
      action: 'create',
      entityType: 'order',
      entityId: order.id,
      summary: order.orderNumber,
      details: { grandTotal: order.grandTotal, itemCount: order.items.length },
    })
    return res.status(201).json(order)
  } catch (error) {
    return sendError(res, error)
  }
}

export const getMyShopOrders = async (req, res) => {
  try {
    const result = await listOrders({
      customerAccountId: req.customer.accountId,
      page: req.query.page,
      limit: req.query.limit || 20,
    })
    return res.json({
      items: result.items.map(({ adminNote: _adminNote, processedBy: _processedBy, ...order }) => order),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: Math.max(1, Math.ceil(result.total / result.limit)),
      },
    })
  } catch (error) {
    return sendError(res, error)
  }
}
