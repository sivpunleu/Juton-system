import { randomUUID } from 'node:crypto'
import { Op, cast, col, fn, json, where } from 'sequelize'
import {
  getStorageMode,
  sequelize,
} from '../config/database.js'
import Counter from '../models/Counter.js'
import Invoice from '../models/Invoice.js'
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

export const createUniqueShareToken = (usedTokens = new Set()) => {
  let token = createShareToken()
  while (usedTokens.has(token)) token = createShareToken()
  usedTokens.add(token)
  return token
}

const withNestedIds = (records = []) =>
  records.map((record) => ({
    ...record,
    id: record.id || randomUUID(),
  }))

const normalizeInvoiceCollections = (payload) => ({
  ...payload,
  items: withNestedIds(payload.items || []),
  payments: withNestedIds(payload.payments || []),
})

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
    return { items, total, ...pagination }
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
    return Invoice.findOne({
      where: {
        id,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    })
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
    return Invoice.findOne({ where: { shareToken: token, deletedAt: null } })
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
  })
  if (getStorageMode() === 'mysql') return Invoice.create(normalized)

  return mutateLocalCollection('invoices', (invoices) => {
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
      const payload =
        typeof payloadOrFactory === 'function'
          ? await payloadOrFactory(invoice)
          : payloadOrFactory
      return invoice.update(normalizeInvoiceCollections(payload), {
        transaction,
      })
    })
  }

  return mutateLocalCollection('invoices', (invoices) => {
    const index = invoices.findIndex(
      (invoice) =>
        String(invoice.id) === String(id) && !invoice.deletedAt,
    )
    if (index === -1) return null
    const payload =
      typeof payloadOrFactory === 'function'
        ? payloadOrFactory(invoices[index])
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
    id: payment.id || randomUUID(),
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
      const totals = paymentTotals(invoice, Number(normalizedPayment.amount))
      return invoice.update(
        {
          payments: [...(invoice.payments || []), normalizedPayment],
          ...totals,
          updatedBy: normalizedPayment.recordedBy || invoice.updatedBy,
        },
        { transaction },
      )
    })
  }
  return mutateLocalCollection('invoices', (invoices) => {
    const invoice = invoices.find(
      (item) => String(item.id) === String(id) && !item.deletedAt,
    )
    if (!invoice) return null
    const totals = paymentTotals(invoice, Number(normalizedPayment.amount))
    invoice.payments = [...(invoice.payments || []), normalizedPayment]
    Object.assign(invoice, totals, {
      updatedBy: normalizedPayment.recordedBy || invoice.updatedBy || '',
      updatedAt: timestamp,
    })
    return invoice
  })
}

export const getAllInvoices = async () => {
  if (getStorageMode() === 'mysql') {
    return Invoice.findAll({ order: [['createdAt', 'DESC']], raw: true })
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
