import { randomUUID } from 'node:crypto'
import { Op, cast, col, fn, json, where } from 'sequelize'
import {
  getStorageMode,
  sequelize,
} from '../config/database.js'
import Counter from '../models/Counter.js'
import Invoice from '../models/Invoice.js'
import InvoiceItem from '../models/InvoiceItem.js'
import InvoicePayment from '../models/InvoicePayment.js'
import Product from '../models/Product.js'
import StockMovement from '../models/StockMovement.js'
import { asPlainObject } from '../models/modelHelpers.js'
import { createShareToken } from '../utils/shareToken.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

const duplicateInvoiceError = () => {
  const error = new Error('Invoice number already exists')
  error.code = 11000
  return error
}

const paymentError = (message) => {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

const stockError = (message) => {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

const paymentTotals = (invoice, amount) => {
  if (['draft', 'cancelled'].includes(invoice.status)) {
    throw paymentError('Payments cannot be added to draft or cancelled invoices')
  }

  const grandTotal = roundMoney(invoice.grandTotal)
  const recordedPayments = (invoice.payments || []).reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0,
  )
  const existingPaidAmount = roundMoney(
    Math.max(
      Number(invoice.depositAmount || 0) + recordedPayments,
      Number(invoice.paidAmount || 0),
      grandTotal - Number(invoice.balanceDue || 0),
    ),
  )
  const paidAmount = roundMoney(existingPaidAmount + amount)

  if (paidAmount > grandTotal) {
    throw paymentError('Payment amount cannot exceed the balance due')
  }

  const balanceDue = roundMoney(Math.max(0, grandTotal - paidAmount))
  const status = balanceDue <= 0 ? 'paid' : 'partially_paid'

  return {
    paidAmount,
    balanceDue,
    status,
    paymentStatus: status === 'paid' ? 'paid' : 'partial',
  }
}

const normalizePagination = (page, limit) => ({
  page: Math.max(1, Number(page) || 1),
  limit: Math.min(100, Math.max(1, Number(limit) || 10)),
})

const matchesInvoiceSearch = (invoice, search) => {
  const query = String(search || '').toLocaleLowerCase()
  if (!query) return true
  return [
    invoice.invoiceNumber,
    invoice.customer?.name,
    invoice.customer?.phone,
    invoice.salesperson?.name,
  ].some((value) => String(value || '').toLocaleLowerCase().includes(query))
}

const resolvedStatus = (invoice) => {
  if (invoice.status) return invoice.status
  if (invoice.paymentStatus === 'partial') return 'partially_paid'
  return invoice.paymentStatus || 'unpaid'
}

const existingShareTokens = (invoices) =>
  new Set(invoices.map((invoice) => invoice.shareToken).filter(Boolean))

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const normalizedUuid = (id) =>
  uuidPattern.test(String(id || '')) ? String(id) : null

const normalizedNestedId = (id) => {
  const value = String(id || '').trim()
  return value && value.length <= 64 ? value : randomUUID()
}

export const createUniqueShareToken = (usedTokens = new Set()) => {
  let token = createShareToken()
  while (usedTokens.has(token)) token = createShareToken()
  usedTokens.add(token)
  return token
}

const withNestedIds = (records = []) =>
  records.map((record) => ({
    ...record,
    id: normalizedNestedId(record.id),
  }))

const normalizeInvoiceCollections = (payload) => ({
  ...payload,
  items: withNestedIds(payload.items || []),
  payments: withNestedIds(payload.payments || []),
})

const activeStockStatuses = new Set(['unpaid', 'partially_paid', 'paid'])

const stockAppliesTo = (invoice) =>
  Boolean(invoice && activeStockStatuses.has(resolvedStatus(invoice)))

const invoiceItemFromRow = (row) => ({
  id: row.id,
  productId: row.productId || null,
  description: row.description,
  itemCode: row.itemCode || '',
  colorCode: row.colorCode || '',
  quantity: Number(row.quantity || 0),
  unit: row.unit || '',
  unitPrice: Number(row.unitPrice || 0),
  discount: Number(row.discount || 0),
  total: Number(row.total || 0),
})

const invoicePaymentFromRow = (row) => ({
  id: row.id,
  amount: Number(row.amount || 0),
  paidAt: row.paidAt,
  receivedBy: row.receivedBy || '',
  note: row.note || '',
  recordedBy: row.recordedBy || '',
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const invoiceItemRows = (invoiceId, items = []) =>
  items.map((item, index) => ({
    id: normalizedNestedId(item.id),
    invoiceId,
    productId: normalizedUuid(item.productId),
    description: String(item.description || '').trim(),
    itemCode: String(item.itemCode || '').trim(),
    colorCode: String(item.colorCode || '').trim(),
    quantity: Number(item.quantity || 0),
    unit: String(item.unit || '').trim(),
    unitPrice: Number(item.unitPrice || 0),
    discount: Number(item.discount || 0),
    total: Number(item.total || 0),
    sortOrder: index,
  }))

const invoicePaymentRows = (invoiceId, payments = []) =>
  payments.map((payment) => ({
    id: normalizedNestedId(payment.id),
    invoiceId,
    amount: Number(payment.amount || 0),
    paidAt: payment.paidAt || payment.createdAt || new Date(),
    receivedBy: String(payment.receivedBy || '').trim(),
    note: String(payment.note || '').trim(),
    recordedBy: String(payment.recordedBy || '').trim(),
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  }))

const replaceInvoiceChildren = async (
  invoiceId,
  { items = [], payments = [] },
  transaction,
) => {
  await InvoiceItem.destroy({ where: { invoiceId }, transaction })
  await InvoicePayment.destroy({ where: { invoiceId }, transaction })
  const itemRows = invoiceItemRows(invoiceId, items)
  const paymentRows = invoicePaymentRows(invoiceId, payments)
  if (itemRows.length) {
    await InvoiceItem.bulkCreate(itemRows, { transaction })
  }
  if (paymentRows.length) {
    await InvoicePayment.bulkCreate(paymentRows, { transaction })
  }
}

const hydrateInvoiceCollections = async (invoice, options = {}) => {
  if (!invoice) return null
  if (getStorageMode() !== 'mysql') return invoice

  const data = asPlainObject(invoice)
  const { transaction } = options
  const [itemRows, paymentRows] = await Promise.all([
    InvoiceItem.findAll({
      where: { invoiceId: data.id },
      order: [['sortOrder', 'ASC']],
      raw: true,
      transaction,
    }),
    InvoicePayment.findAll({
      where: { invoiceId: data.id },
      order: [['paidAt', 'ASC'], ['createdAt', 'ASC']],
      raw: true,
      transaction,
    }),
  ])

  return {
    ...data,
    items: itemRows.length
      ? itemRows.map(invoiceItemFromRow)
      : data.items || [],
    payments: paymentRows.length
      ? paymentRows.map(invoicePaymentFromRow)
      : data.payments || [],
  }
}

const hydrateInvoiceList = async (invoices, options = {}) =>
  Promise.all(invoices.map((invoice) => hydrateInvoiceCollections(invoice, options)))

const productQuantityMap = (invoice) => {
  const map = new Map()
  for (const item of invoice?.items || []) {
    const productId = normalizedUuid(item.productId)
    const quantity = Number(item.quantity || 0)
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue
    const current = map.get(productId) || 0
    map.set(productId, current + quantity)
  }
  return map
}

const stockDeltas = (previousInvoice, nextInvoice) => {
  const previousItems = previousInvoice?.stockApplied
    ? productQuantityMap(previousInvoice)
    : new Map()
  const nextItems = stockAppliesTo(nextInvoice)
    ? productQuantityMap(nextInvoice)
    : new Map()
  const productIds = new Set([...previousItems.keys(), ...nextItems.keys()])

  return Array.from(productIds)
    .map((productId) => ({
      productId,
      delta:
        Number(previousItems.get(productId) || 0) -
        Number(nextItems.get(productId) || 0),
    }))
    .filter((item) => item.delta !== 0)
}

const stockMovementForDelta = ({
  product,
  delta,
  invoice,
  actor,
  source = 'invoice',
}) => {
  const previousStock = Number(product.stockQuantity || 0)
  const resultingStock = roundMoney(previousStock + delta)
  if (resultingStock < 0) {
    throw stockError(
      `Insufficient stock for ${product.name}. Available ${previousStock}, required ${Math.abs(delta)}`,
    )
  }

  const timestamp = new Date().toISOString()
  return {
    id: randomUUID(),
    type: delta > 0 ? 'in' : 'out',
    quantity: roundMoney(Math.abs(delta)),
    previousStock,
    resultingStock,
    note:
      delta > 0
        ? `Invoice ${invoice.invoiceNumber} stock restored`
        : `Invoice ${invoice.invoiceNumber} stock deducted`,
    recordedBy: actor || invoice.updatedBy || invoice.createdBy || '',
    recordedAt: timestamp,
    source,
    referenceNumber: invoice.invoiceNumber || '',
  }
}

const applyStockDeltasMysql = async (
  deltas,
  { invoice, actor, transaction },
) => {
  for (const item of deltas) {
    const product = await Product.findOne({
      where: { id: item.productId, deletedAt: null },
      transaction,
      lock: transaction.LOCK.UPDATE,
    })
    if (!product) {
      throw stockError('Product not found for invoice stock movement')
    }

    const movement = stockMovementForDelta({
      product,
      delta: item.delta,
      invoice,
      actor,
    })
    await product.update(
      {
        stockQuantity: movement.resultingStock,
        stockMovements: [...(product.stockMovements || []), movement],
        updatedBy: movement.recordedBy,
      },
      { transaction },
    )
    await StockMovement.create(
      {
        ...movement,
        productId: item.productId,
        invoiceId: invoice.id,
      },
      { transaction },
    )
  }
}

const applyStockDeltasLocal = async (deltas, { invoice, actor }) => {
  if (!deltas.length) return
  await mutateLocalCollection('products', (products) => {
    for (const item of deltas) {
      const product = products.find(
        (record) => String(record.id) === String(item.productId) && !record.deletedAt,
      )
      if (!product) {
        throw stockError('Product not found for invoice stock movement')
      }
      const movement = stockMovementForDelta({
        product,
        delta: item.delta,
        invoice,
        actor,
      })
      product.stockQuantity = movement.resultingStock
      product.stockMovements = [...(product.stockMovements || []), movement]
      product.updatedBy = movement.recordedBy
      product.updatedAt = movement.recordedAt
    }
    return true
  })
}

const reconcileInvoiceStockMysql = async (
  previousInvoice,
  nextInvoice,
  { actor, transaction },
) => {
  const deltas = stockDeltas(previousInvoice, nextInvoice)
  await applyStockDeltasMysql(deltas, {
    invoice: nextInvoice,
    actor,
    transaction,
  })
  return stockAppliesTo(nextInvoice)
}

const reconcileInvoiceStockLocal = async (
  previousInvoice,
  nextInvoice,
  actor,
) => {
  const deltas = stockDeltas(previousInvoice, nextInvoice)
  await applyStockDeltasLocal(deltas, { invoice: nextInvoice, actor })
  return stockAppliesTo(nextInvoice)
}

const mysqlSearchConditions = (search) => {
  const pattern = `%${String(search || '').trim().toLowerCase()}%`
  return [
    where(fn('LOWER', col('invoiceNumber')), {
      [Op.like]: pattern,
    }),
    where(fn('LOWER', cast(json('customer.name'), 'CHAR')), {
      [Op.like]: pattern,
    }),
    where(fn('LOWER', cast(json('customer.phone'), 'CHAR')), {
      [Op.like]: pattern,
    }),
    where(fn('LOWER', cast(json('salesperson.name'), 'CHAR')), {
      [Op.like]: pattern,
    }),
  ]
}

export const listInvoices = async ({
  search = '',
  page = 1,
  limit = 10,
  status = '',
  salesChannel = '',
  salespersonId = '',
  deleted = false,
} = {}) => {
  const pagination = normalizePagination(page, limit)

  if (getStorageMode() === 'mysql') {
    const query = String(search || '').trim()
    const filters = {
      deletedAt: deleted ? { [Op.not]: null } : null,
      ...(query ? { [Op.or]: mysqlSearchConditions(query) } : {}),
      ...(status ? { status } : {}),
      ...(salesChannel ? { salesChannel } : {}),
      ...(salespersonId ? { salespersonId } : {}),
    }
    const { rows: items, count: total } = await Invoice.findAndCountAll({
      where: filters,
      order: [['createdAt', 'DESC']],
      offset: (pagination.page - 1) * pagination.limit,
      limit: pagination.limit,
    })
    return {
      items: await hydrateInvoiceList(items),
      total,
      ...pagination,
    }
  }

  const invoices = (await readLocalCollection('invoices'))
    .filter((invoice) =>
      deleted ? Boolean(invoice.deletedAt) : !invoice.deletedAt,
    )
    .filter((invoice) => matchesInvoiceSearch(invoice, search))
    .filter((invoice) => !status || resolvedStatus(invoice) === status)
    .filter(
      (invoice) =>
        !salesChannel ||
        (invoice.salesChannel || 'store') === salesChannel,
    )
    .filter(
      (invoice) =>
        !salespersonId ||
        String(invoice.salespersonId || '') === String(salespersonId),
    )
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
  const offset = (pagination.page - 1) * pagination.limit
  return {
    items: invoices.slice(offset, offset + pagination.limit),
    total: invoices.length,
    ...pagination,
  }
}

export const findInvoiceById = async (id, { includeDeleted = false } = {}) => {
  if (getStorageMode() === 'mysql') {
    const invoice = await Invoice.findOne({
      where: {
        id,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    })
    return hydrateInvoiceCollections(invoice)
  }
  const invoices = await readLocalCollection('invoices')
  return (
    invoices.find(
      (invoice) =>
        String(invoice.id) === String(id) &&
        (includeDeleted || !invoice.deletedAt),
    ) || null
  )
}

export const findInvoiceByShareToken = async (shareToken) => {
  const token = String(shareToken || '').trim()
  if (!token) return null
  if (getStorageMode() === 'mysql') {
    const invoice = await Invoice.findOne({
      where: { shareToken: token, deletedAt: null },
    })
    return hydrateInvoiceCollections(invoice)
  }
  const invoices = await readLocalCollection('invoices')
  return (
    invoices.find(
      (invoice) =>
        String(invoice.shareToken || '') === token && !invoice.deletedAt,
    ) || null
  )
}

export const reserveInvoiceNumber = async (dateValue = new Date()) => {
  const year = new Date(dateValue).getFullYear()
  const counterId = `invoice-${year}`

  if (getStorageMode() === 'mysql') {
    return sequelize.transaction(async (transaction) => {
      const [counter] = await Counter.findOrCreate({
        where: { id: counterId },
        defaults: { sequence: 0 },
        transaction,
      })
      await counter.increment('sequence', { by: 1, transaction })
      await counter.reload({ transaction, lock: transaction.LOCK.UPDATE })
      return `INV-${year}-${String(counter.sequence).padStart(5, '0')}`
    })
  }

  const invoices = await readLocalCollection('invoices')
  const latestSequence = invoices.reduce((highest, invoice) => {
    const match = String(invoice.invoiceNumber || '').match(
      new RegExp(`^INV-${year}-(\\d{5})$`),
    )
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)

  return mutateLocalCollection('counters', (counters) => {
    let counter = counters.find((item) => item.id === counterId)
    if (!counter) {
      counter = { id: counterId, sequence: latestSequence }
      counters.push(counter)
    }
    counter.sequence += 1
    return `INV-${year}-${String(counter.sequence).padStart(5, '0')}`
  })
}

export const insertInvoice = async (payload) => {
  const normalized = normalizeInvoiceCollections({
    ...payload,
    shareToken: payload.shareToken || createShareToken(),
    stockApplied: false,
  })
  if (getStorageMode() === 'mysql') {
    return sequelize.transaction(async (transaction) => {
      const invoice = await Invoice.create(normalized, { transaction })
      const nextInvoice = {
        ...normalized,
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      }
      const stockApplied = await reconcileInvoiceStockMysql(null, nextInvoice, {
        actor: normalized.createdBy || normalized.updatedBy,
        transaction,
      })
      await replaceInvoiceChildren(invoice.id, normalized, transaction)
      const updated = await invoice.update({ stockApplied }, { transaction })
      return hydrateInvoiceCollections(updated, { transaction })
    })
  }

  return mutateLocalCollection('invoices', async (invoices) => {
    const duplicate = invoices.some(
      (invoice) =>
        String(invoice.invoiceNumber).toUpperCase() ===
        String(payload.invoiceNumber).toUpperCase(),
    )
    if (duplicate) throw duplicateInvoiceError()

    const timestamp = new Date().toISOString()
    const usedTokens = existingShareTokens(invoices)
    const invoice = {
      ...normalized,
      invoiceNumber: String(payload.invoiceNumber).toUpperCase(),
      shareToken: payload.shareToken || createUniqueShareToken(usedTokens),
      id: randomUUID(),
      deletedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    invoice.stockApplied = await reconcileInvoiceStockLocal(
      null,
      invoice,
      invoice.createdBy || invoice.updatedBy,
    )
    invoices.push(invoice)
    return invoice
  })
}

export const replaceInvoice = async (id, payloadOrFactory) => {
  if (getStorageMode() === 'mysql') {
    return sequelize.transaction(async (transaction) => {
      const invoice = await Invoice.findOne({
        where: { id, deletedAt: null },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
      if (!invoice) return null
      const existing = await hydrateInvoiceCollections(invoice, { transaction })
      const payload =
        typeof payloadOrFactory === 'function'
          ? await payloadOrFactory(existing)
          : payloadOrFactory
      const normalized = normalizeInvoiceCollections(payload)
      const nextInvoice = {
        ...existing,
        ...normalized,
        id: invoice.id,
        invoiceNumber: existing.invoiceNumber,
      }
      const stockApplied = await reconcileInvoiceStockMysql(
        existing,
        nextInvoice,
        {
          actor: normalized.updatedBy || existing.updatedBy,
          transaction,
        },
      )
      await replaceInvoiceChildren(invoice.id, normalized, transaction)
      const updated = await invoice.update(
        {
          ...normalized,
          stockApplied,
        },
        { transaction },
      )
      return hydrateInvoiceCollections(updated, { transaction })
    })
  }

  return mutateLocalCollection('invoices', async (invoices) => {
    const index = invoices.findIndex(
      (invoice) =>
        String(invoice.id) === String(id) && !invoice.deletedAt,
    )
    if (index === -1) return null
    const payload =
      typeof payloadOrFactory === 'function'
        ? await payloadOrFactory(invoices[index])
        : payloadOrFactory
    const normalized = normalizeInvoiceCollections(payload)
    const duplicate = invoices.some(
      (invoice, invoiceIndex) =>
        invoiceIndex !== index &&
        String(invoice.invoiceNumber).toUpperCase() ===
          String(payload.invoiceNumber).toUpperCase(),
    )
    if (duplicate) throw duplicateInvoiceError()

    const invoice = {
      ...invoices[index],
      ...normalized,
      invoiceNumber: String(payload.invoiceNumber).toUpperCase(),
      id: invoices[index].id,
      createdAt: invoices[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    invoice.stockApplied = await reconcileInvoiceStockLocal(
      invoices[index],
      invoice,
      invoice.updatedBy,
    )
    invoices[index] = invoice
    return invoice
  })
}

export const softDeleteInvoice = async (id, actor) => {
  const timestamp = new Date()
  if (getStorageMode() === 'mysql') {
    const invoice = await Invoice.findOne({ where: { id, deletedAt: null } })
    if (!invoice) return null
    return invoice.update({ deletedAt: timestamp, deletedBy: actor })
  }
  return mutateLocalCollection('invoices', (invoices) => {
    const invoice = invoices.find(
      (item) => String(item.id) === String(id) && !item.deletedAt,
    )
    if (!invoice) return null
    invoice.deletedAt = timestamp.toISOString()
    invoice.deletedBy = actor
    invoice.updatedAt = timestamp.toISOString()
    return invoice
  })
}

export const restoreInvoice = async (id, actor) => {
  if (getStorageMode() === 'mysql') {
    const invoice = await Invoice.findOne({
      where: { id, deletedAt: { [Op.not]: null } },
    })
    if (!invoice) return null
    return invoice.update({ deletedAt: null, deletedBy: '', updatedBy: actor })
  }
  return mutateLocalCollection('invoices', (invoices) => {
    const invoice = invoices.find(
      (item) => String(item.id) === String(id) && item.deletedAt,
    )
    if (!invoice) return null
    invoice.deletedAt = null
    invoice.deletedBy = ''
    invoice.updatedBy = actor
    invoice.updatedAt = new Date().toISOString()
    return invoice
  })
}

export const appendInvoicePayment = async (id, payment) => {
  const timestamp = new Date().toISOString()
  const normalizedPayment = {
    ...payment,
    id: normalizedNestedId(payment.id),
    createdAt: payment.createdAt || timestamp,
    updatedAt: timestamp,
  }
  if (getStorageMode() === 'mysql') {
    return sequelize.transaction(async (transaction) => {
      const invoice = await Invoice.findOne({
        where: { id, deletedAt: null },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
      if (!invoice) return null
      const existing = await hydrateInvoiceCollections(invoice, { transaction })
      const totals = paymentTotals(existing, Number(normalizedPayment.amount))
      const nextPayments = [...(existing.payments || []), normalizedPayment]
      const nextInvoice = {
        ...existing,
        payments: nextPayments,
        ...totals,
        updatedBy: normalizedPayment.recordedBy || existing.updatedBy,
      }
      const stockApplied = await reconcileInvoiceStockMysql(
        existing,
        nextInvoice,
        {
          actor: normalizedPayment.recordedBy || existing.updatedBy,
          transaction,
        },
      )
      await replaceInvoiceChildren(
        invoice.id,
        {
          items: existing.items || [],
          payments: nextPayments,
        },
        transaction,
      )
      const updated = await invoice.update(
        {
          payments: nextPayments,
          ...totals,
          stockApplied,
          updatedBy: normalizedPayment.recordedBy || existing.updatedBy,
        },
        { transaction },
      )
      return hydrateInvoiceCollections(updated, { transaction })
    })
  }
  return mutateLocalCollection('invoices', async (invoices) => {
    const invoice = invoices.find(
      (item) => String(item.id) === String(id) && !item.deletedAt,
    )
    if (!invoice) return null
    const totals = paymentTotals(invoice, Number(normalizedPayment.amount))
    const nextInvoice = {
      ...invoice,
      payments: [...(invoice.payments || []), normalizedPayment],
      ...totals,
      updatedBy: normalizedPayment.recordedBy || invoice.updatedBy || '',
      updatedAt: timestamp,
    }
    nextInvoice.stockApplied = await reconcileInvoiceStockLocal(
      invoice,
      nextInvoice,
      nextInvoice.updatedBy,
    )
    Object.assign(invoice, nextInvoice)
    return invoice
  })
}

export const getAllInvoices = async () => {
  if (getStorageMode() === 'mysql') {
    const invoices = await Invoice.findAll({ order: [['createdAt', 'DESC']] })
    return hydrateInvoiceList(invoices)
  }
  return readLocalCollection('invoices')
}

export const backfillLocalShareTokens = async () => {
  if (getStorageMode() === 'mysql') return 0
  return mutateLocalCollection('invoices', (invoices) => {
    const usedTokens = existingShareTokens(invoices)
    let updated = 0
    invoices.forEach((invoice) => {
      if (invoice.shareToken) return
      invoice.shareToken = createUniqueShareToken(usedTokens)
      invoice.updatedAt = new Date().toISOString()
      updated += 1
    })
    return updated
  })
}

export const getInvoiceDashboard = async () => {
  const invoices = (await getAllInvoices()).filter(
    (invoice) => !invoice.deletedAt,
  )
  const paidInvoices = invoices.filter(
    (invoice) => resolvedStatus(invoice) === 'paid',
  )
  const activeInvoices = invoices.filter(
    (invoice) =>
      !['draft', 'cancelled'].includes(resolvedStatus(invoice)),
  )
  const revenue = activeInvoices.reduce(
    (sum, invoice) =>
      sum +
      Math.max(
        Number(invoice.paidAmount || 0),
        Math.max(
          0,
          Number(invoice.grandTotal || 0) - Number(invoice.balanceDue || 0),
        ),
      ),
    0,
  )
  const outstanding = activeInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.balanceDue || 0),
    0,
  )
  const totalsByStatus = [
    'draft',
    'unpaid',
    'partially_paid',
    'paid',
    'cancelled',
  ].reduce((result, itemStatus) => {
    result[itemStatus] = invoices.filter(
      (invoice) => resolvedStatus(invoice) === itemStatus,
    ).length
    return result
  }, {})

  return {
    totalInvoices: invoices.length,
    revenue: Math.round(revenue * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
    paidInvoices: paidInvoices.length,
    totalsByStatus,
    recentInvoices: invoices
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .slice(0, 5),
  }
}
