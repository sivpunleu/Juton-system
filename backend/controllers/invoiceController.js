import { writeAuditLog } from '../repositories/auditRepository.js'
import {
  appendInvoicePayment,
  findInvoiceById,
  findInvoiceByShareToken,
  getInvoiceDashboard,
  insertInvoice,
  listInvoices,
  reserveInvoiceNumber,
  restoreInvoice,
  replaceInvoice,
  softDeleteInvoice,
} from '../repositories/invoiceRepository.js'
import { sendDatabaseError } from '../utils/databaseError.js'
import { attachKhqrPayment } from '../services/khqrService.js'

const VALID_STATUSES = [
  'draft',
  'unpaid',
  'partially_paid',
  'paid',
  'cancelled',
]

const roundMoney = (value) => {
  const numericValue =
    value === undefined || value === null || value === '' ? 0 : Number(value)
  return Math.round((numericValue + Number.EPSILON) * 100) / 100
}

export const calculateTotals = (payload) => {
  const items = (payload.items || []).map((item) => {
    const quantity = Number(item.quantity)
    const unitPrice = Number(item.unitPrice)
    const discount = Number(item.discount || 0)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Each item quantity must be greater than zero')
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error('Each item unit price must be zero or greater')
    }
    if (!Number.isFinite(discount) || discount < 0) {
      throw new Error('Each item discount must be zero or greater')
    }

    const baseTotal = quantity * unitPrice
    if (discount > baseTotal) {
      throw new Error('Item discount cannot exceed its line total')
    }

    return {
      id: item.id || undefined,
      productId: item.productId || null,
      description: String(item.description || '').trim(),
      itemCode: String(item.itemCode || '').trim(),
      colorCode: String(item.colorCode || '').trim(),
      quantity,
      unit: String(item.unit || '').trim(),
      unitPrice: roundMoney(unitPrice),
      discount: roundMoney(discount),
      total: roundMoney(baseTotal - discount),
    }
  })

  if (!items.length) {
    throw new Error('At least one invoice item is required')
  }
  if (items.some((item) => !item.description)) {
    throw new Error('Every item needs a description')
  }

  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0))
  const discount = roundMoney(Number(payload.discount || 0))
  const taxRate = roundMoney(Number(payload.taxRate || 0))
  const deliveryFee = roundMoney(Number(payload.deliveryFee || 0))
  const depositRate = roundMoney(Number(payload.depositRate || 0))

  if (!Number.isFinite(discount)) {
    throw new Error('Invoice discount must be a valid number')
  }
  if (!Number.isFinite(taxRate)) {
    throw new Error('Tax rate must be a valid number')
  }
  if (!Number.isFinite(deliveryFee)) {
    throw new Error('Delivery fee must be a valid number')
  }
  if (!Number.isFinite(depositRate)) {
    throw new Error('Deposit rate must be a valid number')
  }
  if (discount < 0 || discount > subtotal) {
    throw new Error('Invoice discount must be between zero and the subtotal')
  }
  if (taxRate < 0 || taxRate > 100) {
    throw new Error('Tax rate must be between zero and 100')
  }
  if (deliveryFee < 0) {
    throw new Error('Delivery fee cannot be negative')
  }
  if (depositRate < 0 || depositRate > 100) {
    throw new Error('Deposit rate must be between zero and 100')
  }

  const taxableAmount = subtotal - discount
  const taxAmount = roundMoney(taxableAmount * (taxRate / 100))
  const grandTotal = roundMoney(taxableAmount + taxAmount + deliveryFee)
  const depositAmount = roundMoney(grandTotal * (depositRate / 100))

  return {
    items,
    subtotal,
    discount,
    taxRate,
    taxAmount,
    deliveryFee,
    depositRate,
    depositAmount,
    grandTotal,
    balanceDue: roundMoney(grandTotal - depositAmount),
  }
}

const resolveStatus = ({ requestedStatus, paidAmount, balanceDue }) => {
  if (requestedStatus === 'draft' || requestedStatus === 'cancelled') {
    return requestedStatus
  }
  if (balanceDue <= 0) return 'paid'
  if (paidAmount > 0) return 'partially_paid'
  return 'unpaid'
}

const legacyPaymentStatus = (status) => {
  if (status === 'paid') return 'paid'
  if (status === 'partially_paid') return 'partial'
  return 'unpaid'
}

export const normalizeSalesAttribution = (body) => {
  const salesChannel =
    body.salesChannel === 'salesperson' ? 'salesperson' : 'store'

  if (salesChannel === 'store') {
    return {
      salesChannel,
      salespersonId: null,
      salesperson: { name: '', phone: '' },
    }
  }

  const name = String(body.salesperson?.name || '').trim()
  if (!name) {
    throw new Error('Please select a salesperson')
  }

  return {
    salesChannel,
    salespersonId: body.salespersonId || null,
    salesperson: {
      name,
      phone: String(body.salesperson?.phone || '').trim(),
    },
  }
}

export const normalizeInvoice = (
  body,
  { invoiceNumber, actor, existingPayments = [] } = {},
) => {
  const customerName = String(body.customer?.name || '').trim()
  const invoiceDate = new Date(body.invoiceDate)
  const dueDate = new Date(body.dueDate)

  if (!invoiceNumber) {
    throw new Error('Invoice number is required')
  }
  if (!customerName) {
    throw new Error('Customer name is required')
  }
  if (Number.isNaN(invoiceDate.getTime()) || Number.isNaN(dueDate.getTime())) {
    throw new Error('Invoice date and due date must be valid')
  }

  const totals = calculateTotals(body)
  const payments = Array.isArray(existingPayments) ? existingPayments : []
  const historyPaidAmount = roundMoney(
    payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
  )
  const paidAmount = roundMoney(totals.depositAmount + historyPaidAmount)
  if (paidAmount > totals.grandTotal) {
    throw new Error(
      'Invoice total cannot be less than the amount already received',
    )
  }
  const balanceDue = roundMoney(
    Math.max(0, totals.grandTotal - paidAmount),
  )
  const requestedStatus = VALID_STATUSES.includes(body.status)
    ? body.status
    : body.paymentStatus === 'partial'
      ? 'partially_paid'
      : body.paymentStatus || 'unpaid'
  const status = resolveStatus({
    requestedStatus,
    paidAmount,
    balanceDue,
  })
  const salesAttribution = normalizeSalesAttribution(body)

  return {
    invoiceNumber,
    invoiceDate: invoiceDate.toISOString(),
    dueDate: dueDate.toISOString(),
    customerId: body.customerId || null,
    customer: {
      name: customerName,
      phone: String(body.customer?.phone || '').trim(),
      address: String(body.customer?.address || '').trim(),
    },
    ...salesAttribution,
    status,
    paymentStatus: legacyPaymentStatus(status),
    payments,
    paidAmount,
    balanceDue,
    notes: String(body.notes || '').trim(),
    updatedBy: actor,
    ...totals,
    balanceDue,
  }
}

const sendError = (res, error) =>
  sendDatabaseError(res, error, 'Request failed')

const paginationResponse = ({ items, total, page, limit }) => ({
  items,
  pagination: {
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  },
})

const toPublicInvoice = (invoice) => {
  const data =
    typeof invoice.get === 'function' ? invoice.get({ plain: true }) : invoice
  const {
    id,
    shareToken,
    payments,
    createdBy,
    updatedBy,
    deletedBy,
    deletedAt,
    __v,
    ...publicInvoice
  } = data
  return attachKhqrPayment(publicInvoice)
}

export const getInvoices = async (req, res) => {
  try {
    const result = await listInvoices({
      search: String(req.query.search || '').trim(),
      page: req.query.page,
      limit: req.query.limit,
      status: String(req.query.status || '').trim(),
      salesChannel: String(req.query.salesChannel || '').trim(),
      salespersonId: String(req.query.salespersonId || '').trim(),
      deleted: req.query.deleted === 'true',
    })
    res.json(paginationResponse(result))
  } catch (error) {
    sendError(res, error)
  }
}

export const getInvoiceById = async (req, res) => {
  try {
    const invoice = await findInvoiceById(req.params.id)
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' })
    }
    res.json(attachKhqrPayment(invoice))
  } catch (error) {
    sendError(res, error)
  }
}

export const getPublicInvoiceByToken = async (req, res) => {
  try {
    const invoice = await findInvoiceByShareToken(req.params.token)
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' })
    }
    res.json(toPublicInvoice(invoice))
  } catch (error) {
    sendError(res, error)
  }
}

export const createInvoice = async (req, res) => {
  try {
    const invoiceNumber = await reserveInvoiceNumber(req.body.invoiceDate)
    const payload = normalizeInvoice(req.body, {
      invoiceNumber,
      actor: req.admin.username,
    })
    payload.createdBy = req.admin.username
    const invoice = await insertInvoice(payload)
    await writeAuditLog({
      actor: req.admin,
      action: 'create',
      entityType: 'invoice',
      entityId: invoice.id,
      summary: invoice.invoiceNumber,
    })
    res.status(201).json(attachKhqrPayment(invoice))
  } catch (error) {
    sendError(res, error)
  }
}

export const updateInvoice = async (req, res) => {
  try {
    const invoice = await replaceInvoice(
      req.params.id,
      (existing) =>
        normalizeInvoice(req.body, {
          invoiceNumber: existing.invoiceNumber,
          actor: req.admin.username,
          existingPayments: existing.payments,
        }),
    )
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' })
    }
    await writeAuditLog({
      actor: req.admin,
      action: 'update',
      entityType: 'invoice',
      entityId: invoice.id,
      summary: invoice.invoiceNumber,
    })
    res.json(attachKhqrPayment(invoice))
  } catch (error) {
    sendError(res, error)
  }
}

export const deleteInvoice = async (req, res) => {
  try {
    const invoice = await softDeleteInvoice(
      req.params.id,
      req.admin.username,
    )
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' })
    }
    await writeAuditLog({
      actor: req.admin,
      action: 'delete',
      entityType: 'invoice',
      entityId: invoice.id,
      summary: invoice.invoiceNumber,
    })
    res.json({
      message: 'Invoice moved to trash',
      invoice: attachKhqrPayment(invoice),
    })
  } catch (error) {
    sendError(res, error)
  }
}

export const restoreDeletedInvoice = async (req, res) => {
  try {
    const invoice = await restoreInvoice(req.params.id, req.admin.username)
    if (!invoice) {
      return res.status(404).json({ message: 'Deleted invoice not found' })
    }
    await writeAuditLog({
      actor: req.admin,
      action: 'restore',
      entityType: 'invoice',
      entityId: invoice.id,
      summary: invoice.invoiceNumber,
    })
    res.json(attachKhqrPayment(invoice))
  } catch (error) {
    sendError(res, error)
  }
}

export const addInvoicePayment = async (req, res) => {
  try {
    const amount = roundMoney(req.body.amount)
    const paidAt = new Date(req.body.paidAt || Date.now())
    const receivedBy = String(
      req.body.receivedBy || req.admin.username,
    ).trim()
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Payment amount must be greater than zero')
    }
    if (Number.isNaN(paidAt.getTime())) {
      throw new Error('Payment date is invalid')
    }
    if (!receivedBy) {
      throw new Error('Received by is required')
    }

    const updated = await appendInvoicePayment(
      req.params.id,
      {
        amount,
        paidAt: paidAt.toISOString(),
        receivedBy,
        note: String(req.body.note || '').trim(),
        recordedBy: req.admin.username,
      },
    )
    if (!updated) {
      return res.status(404).json({ message: 'Invoice not found' })
    }
    await writeAuditLog({
      actor: req.admin,
      action: 'payment',
      entityType: 'invoice',
      entityId: updated.id,
      summary: `${updated.invoiceNumber}: $${amount.toFixed(2)}`,
      details: { amount, receivedBy, paidAt: paidAt.toISOString() },
    })
    res.status(201).json(attachKhqrPayment(updated))
  } catch (error) {
    sendError(res, error)
  }
}

export const getDashboard = async (_req, res) => {
  try {
    res.json(await getInvoiceDashboard())
  } catch (error) {
    sendError(res, error)
  }
}
