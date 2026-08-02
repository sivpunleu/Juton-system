import { randomUUID } from 'node:crypto'
import { getStorageMode, sequelize } from '../config/database.js'
import Counter from '../models/Counter.js'
import Order from '../models/Order.js'
import OrderItem from '../models/OrderItem.js'
import Product from '../models/Product.js'
import { asPlainObject } from '../models/modelHelpers.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

const requestError = (message, statusCode = 400) => {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

const normalizePagination = (page, limit) => ({
  page: Math.max(1, Number(page) || 1),
  limit: Math.min(100, Math.max(1, Number(limit) || 10)),
})

const orderItemFromRow = (row) => ({
  id: row.id,
  productId: row.productId || null,
  description: row.description,
  itemCode: row.itemCode || '',
  colorCode: row.colorCode || '',
  quantity: Number(row.quantity || 0),
  unit: row.unit || '',
  unitPrice: Number(row.unitPrice || 0),
  total: Number(row.total || 0),
})

const plainOrder = (order) => {
  const data = asPlainObject(order)
  if (!data) return null
  return {
    ...data,
    subtotal: Number(data.subtotal || 0),
    deliveryFee: Number(data.deliveryFee || 0),
    grandTotal: Number(data.grandTotal || 0),
    items: (data.items || []).map((item) => ({
      ...item,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      total: Number(item.total || 0),
    })),
  }
}

const hydrateOrder = async (order, { transaction } = {}) => {
  if (!order || getStorageMode() !== 'mysql') return plainOrder(order)
  const data = plainOrder(order)
  const itemRows = await OrderItem.findAll({
    where: { orderId: data.id },
    order: [['sortOrder', 'ASC']],
    raw: true,
    transaction,
  })
  return {
    ...data,
    items: itemRows.length ? itemRows.map(orderItemFromRow) : data.items,
  }
}

const normalizeCartLines = (items) => {
  if (!Array.isArray(items) || !items.length) {
    throw requestError('Your cart is empty')
  }

  const quantities = new Map()
  for (const item of items) {
    const productId = String(item?.productId || '').trim()
    const quantity = Number(item?.quantity)
    if (!productId) throw requestError('Each cart item needs a product')
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
      throw requestError('Each cart quantity must be between 0 and 1000')
    }
    quantities.set(productId, roundMoney((quantities.get(productId) || 0) + quantity))
  }
  return Array.from(quantities, ([productId, quantity]) => ({ productId, quantity }))
}

const itemFromProduct = (product, quantity) => {
  const source = asPlainObject(product)
  const available = Number(source.stockQuantity || 0)
  if (quantity > available) {
    throw requestError(`${source.name} does not have enough stock available`)
  }
  const unitPrice = roundMoney(source.unitPrice)
  return {
    id: randomUUID(),
    productId: source.id,
    description: String(source.name || '').trim(),
    itemCode: String(source.itemCode || '').trim(),
    colorCode: String(source.colorCode || '').trim(),
    quantity,
    unit: String(source.unit || '').trim(),
    unitPrice,
    total: roundMoney(quantity * unitPrice),
  }
}

const buildOrderPayload = ({ orderNumber, customer, items, customerNote = '' }) => {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0))
  return {
    orderNumber,
    customerAccountId: customer.accountId,
    customerId: customer.customerId,
    customer: {
      name: String(customer.name || '').trim(),
      phone: String(customer.phone || '').trim(),
      address: String(customer.address || '').trim(),
    },
    items,
    subtotal,
    deliveryFee: 0,
    grandTotal: subtotal,
    status: 'pending',
    customerNote: String(customerNote || '').trim().slice(0, 1000),
    adminNote: '',
    processedBy: '',
    processedAt: null,
    invoiceId: null,
  }
}

const reserveOrderNumberInTransaction = async (dateValue, transaction) => {
  const year = new Date(dateValue).getFullYear()
  const counterId = `order-${year}`
  const [counter] = await Counter.findOrCreate({
    where: { id: counterId },
    defaults: { sequence: 0 },
    transaction,
  })
  await counter.increment('sequence', { by: 1, transaction })
  await counter.reload({ transaction, lock: transaction.LOCK.UPDATE })
  return `ORD-${year}-${String(counter.sequence).padStart(5, '0')}`
}

export const reserveOrderNumber = async (dateValue = new Date()) => {
  const year = new Date(dateValue).getFullYear()
  if (getStorageMode() === 'mysql') {
    return sequelize.transaction((transaction) =>
      reserveOrderNumberInTransaction(dateValue, transaction),
    )
  }

  const orders = await readLocalCollection('orders')
  const latestSequence = orders.reduce((highest, order) => {
    const match = String(order.orderNumber || '').match(
      new RegExp(`^ORD-${year}-(\\d{5})$`),
    )
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
  return mutateLocalCollection('counters', (counters) => {
    const id = `order-${year}`
    let counter = counters.find((item) => item.id === id)
    if (!counter) {
      counter = { id, sequence: latestSequence }
      counters.push(counter)
    }
    counter.sequence += 1
    return `ORD-${year}-${String(counter.sequence).padStart(5, '0')}`
  })
}

export const createOrderFromCart = async ({ customer, items, customerNote }) => {
  const lines = normalizeCartLines(items)
  if (!customer?.accountId || !customer?.customerId || !customer?.name) {
    throw requestError('Customer profile is incomplete')
  }

  if (getStorageMode() === 'mysql') {
    return sequelize.transaction(async (transaction) => {
      const orderItems = []
      for (const line of lines) {
        const product = await Product.findOne({
          where: { id: line.productId, deletedAt: null },
          transaction,
          lock: transaction.LOCK.UPDATE,
        })
        if (!product) throw requestError('A product in your cart is unavailable')
        orderItems.push(itemFromProduct(product, line.quantity))
      }
      const payload = buildOrderPayload({
        orderNumber: await reserveOrderNumberInTransaction(new Date(), transaction),
        customer,
        items: orderItems,
        customerNote,
      })
      const order = await Order.create(payload, { transaction })
      await OrderItem.bulkCreate(
        orderItems.map((item, sortOrder) => ({
          ...item,
          orderId: order.id,
          sortOrder,
        })),
        { transaction },
      )
      return hydrateOrder(order, { transaction })
    })
  }

  const products = await readLocalCollection('products')
  const orderItems = lines.map((line) => {
    const product = products.find(
      (item) => String(item.id) === line.productId && !item.deletedAt,
    )
    if (!product) throw requestError('A product in your cart is unavailable')
    return itemFromProduct(product, line.quantity)
  })
  const payload = buildOrderPayload({
    orderNumber: await reserveOrderNumber(new Date()),
    customer,
    items: orderItems,
    customerNote,
  })
  return mutateLocalCollection('orders', (orders) => {
    const timestamp = new Date().toISOString()
    const order = {
      ...payload,
      id: randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    orders.push(order)
    return order
  })
}

const matchesSearch = (order, search) => {
  const query = String(search || '').trim().toLowerCase()
  if (!query) return true
  return [order.orderNumber, order.customer?.name, order.customer?.phone].some(
    (value) => String(value || '').toLowerCase().includes(query),
  )
}

export const listOrders = async ({
  search = '',
  status = '',
  customerAccountId = '',
  page = 1,
  limit = 10,
} = {}) => {
  const pagination = normalizePagination(page, limit)
  let orders
  if (getStorageMode() === 'mysql') {
    orders = await Order.findAll({
      where: {
        ...(status ? { status } : {}),
        ...(customerAccountId ? { customerAccountId } : {}),
      },
      order: [['createdAt', 'DESC']],
    })
    orders = await Promise.all(orders.map((order) => hydrateOrder(order)))
  } else {
    orders = (await readLocalCollection('orders')).map(plainOrder)
  }
  const filtered = orders
    .filter((order) => (!status || order.status === status))
    .filter(
      (order) =>
        !customerAccountId ||
        String(order.customerAccountId) === String(customerAccountId),
    )
    .filter((order) => matchesSearch(order, search))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
  const offset = (pagination.page - 1) * pagination.limit
  return {
    items: filtered.slice(offset, offset + pagination.limit),
    total: filtered.length,
    ...pagination,
  }
}

export const findOrderById = async (id) => {
  if (getStorageMode() === 'mysql') {
    return hydrateOrder(await Order.findByPk(id))
  }
  const orders = await readLocalCollection('orders')
  return plainOrder(orders.find((order) => String(order.id) === String(id)) || null)
}

export const updateOrderStatus = async (
  id,
  { status, adminNote = '', actor = '' },
) => {
  if (!['confirmed', 'rejected'].includes(status)) {
    throw requestError('Order status must be confirmed or rejected')
  }
  const apply = (order) => {
    if (order.status === 'converted') {
      throw requestError('A converted order cannot be changed')
    }
    if (order.status === 'rejected' && status !== 'rejected') {
      throw requestError('A rejected order cannot be confirmed')
    }
    return {
      ...order,
      status,
      adminNote: String(adminNote || '').trim().slice(0, 1000),
      processedBy: actor,
      processedAt: new Date().toISOString(),
    }
  }

  if (getStorageMode() === 'mysql') {
    return sequelize.transaction(async (transaction) => {
      const order = await Order.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
      if (!order) return null
      const next = apply(plainOrder(order))
      await order.update(next, { transaction })
      return hydrateOrder(order, { transaction })
    })
  }
  return mutateLocalCollection('orders', (orders) => {
    const index = orders.findIndex((order) => String(order.id) === String(id))
    if (index === -1) return null
    orders[index] = { ...apply(orders[index]), updatedAt: new Date().toISOString() }
    return plainOrder(orders[index])
  })
}

export const markOrderConverted = async (id, { invoiceId, actor = '' }) => {
  if (!invoiceId) throw requestError('Invoice is required to convert an order')
  const apply = (order) => {
    if (order.invoiceId) throw requestError('This order already has an invoice')
    if (order.status !== 'confirmed') {
      throw requestError('Confirm the order before creating an invoice')
    }
    return {
      ...order,
      status: 'converted',
      invoiceId,
      processedBy: actor,
      processedAt: new Date().toISOString(),
    }
  }

  if (getStorageMode() === 'mysql') {
    return sequelize.transaction(async (transaction) => {
      const order = await Order.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
      if (!order) return null
      await order.update(apply(plainOrder(order)), { transaction })
      return hydrateOrder(order, { transaction })
    })
  }
  return mutateLocalCollection('orders', (orders) => {
    const index = orders.findIndex((order) => String(order.id) === String(id))
    if (index === -1) return null
    orders[index] = { ...apply(orders[index]), updatedAt: new Date().toISOString() }
    return plainOrder(orders[index])
  })
}

export const getAllOrdersForBackup = async () => {
  if (getStorageMode() === 'mysql') {
    const orders = await Order.findAll({ order: [['createdAt', 'ASC']] })
    return Promise.all(orders.map((order) => hydrateOrder(order)))
  }
  return readLocalCollection('orders')
}
