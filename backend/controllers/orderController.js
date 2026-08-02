import { normalizeInvoice } from './invoiceController.js'
import { writeAuditLog } from '../repositories/auditRepository.js'
import {
  findOrderById,
  listOrders,
  markOrderConverted,
  updateOrderStatus,
} from '../repositories/orderRepository.js'
import { insertInvoice, reserveInvoiceNumber } from '../repositories/invoiceRepository.js'
import { sendDatabaseError } from '../utils/databaseError.js'

const sendError = (res, error) => sendDatabaseError(res, error, 'Request failed')

const paginationResponse = ({ items, total, page, limit }) => ({
  items,
  pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
})

export const getOrders = async (req, res) => {
  try {
    const result = await listOrders({
      search: String(req.query.search || '').trim(),
      status: String(req.query.status || '').trim(),
      page: req.query.page,
      limit: req.query.limit,
    })
    return res.json(paginationResponse(result))
  } catch (error) {
    return sendError(res, error)
  }
}

export const getOrderById = async (req, res) => {
  try {
    const order = await findOrderById(req.params.id)
    if (!order) return res.status(404).json({ message: 'Order not found' })
    return res.json(order)
  } catch (error) {
    return sendError(res, error)
  }
}

export const changeOrderStatus = async (req, res) => {
  try {
    const order = await updateOrderStatus(req.params.id, {
      status: req.body?.status,
      adminNote: req.body?.adminNote,
      actor: req.admin.username,
    })
    if (!order) return res.status(404).json({ message: 'Order not found' })
    await writeAuditLog({
      actor: req.admin,
      action: `order_${order.status}`,
      entityType: 'order',
      entityId: order.id,
      summary: order.orderNumber,
    })
    return res.json(order)
  } catch (error) {
    return sendError(res, error)
  }
}

export const convertOrderToInvoice = async (req, res) => {
  try {
    const order = await findOrderById(req.params.id)
    if (!order) return res.status(404).json({ message: 'Order not found' })
    if (order.invoiceId || order.status === 'converted') {
      return res.status(409).json({ message: 'This order already has an invoice' })
    }
    if (order.status !== 'confirmed') {
      return res.status(400).json({ message: 'Confirm the order before creating an invoice' })
    }
    const now = new Date()
    const dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + 7)
    const invoiceNumber = await reserveInvoiceNumber(now)
    const invoicePayload = normalizeInvoice(
      {
        invoiceDate: now.toISOString(),
        dueDate: dueDate.toISOString(),
        customerId: order.customerId,
        customer: order.customer,
        items: order.items,
        status: 'unpaid',
        notes: [
          `Online order ${order.orderNumber}`,
          order.customerNote ? `Customer note: ${order.customerNote}` : '',
          order.adminNote ? `Admin note: ${order.adminNote}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
      { invoiceNumber, actor: req.admin.username },
    )
    invoicePayload.createdBy = req.admin.username
    const invoice = await insertInvoice(invoicePayload)
    const converted = await markOrderConverted(order.id, {
      invoiceId: invoice.id,
      actor: req.admin.username,
    })
    await writeAuditLog({
      actor: req.admin,
      action: 'convert_order_to_invoice',
      entityType: 'order',
      entityId: order.id,
      summary: `${order.orderNumber} → ${invoice.invoiceNumber}`,
      details: { invoiceId: invoice.id },
    })
    return res.status(201).json({ order: converted, invoice })
  } catch (error) {
    return sendError(res, error)
  }
}
