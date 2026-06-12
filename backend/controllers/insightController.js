import { getAllAuditLogs } from '../repositories/auditRepository.js'
import {
  findCatalogRecord,
  getAllCatalogRecords,
  listCatalogRecords,
} from '../repositories/catalogRepository.js'
import {
  findInvoiceById,
  getAllInvoices,
  listInvoices,
} from '../repositories/invoiceRepository.js'
import { getSystemSettings } from '../repositories/settingsRepository.js'

const resolvedStatus = (invoice) => {
  if (invoice.status) return invoice.status
  if (invoice.paymentStatus === 'partial') return 'partially_paid'
  return invoice.paymentStatus || 'unpaid'
}

const paidAmount = (invoice) =>
  Math.max(
    Number(invoice.paidAmount || 0),
    Math.max(
      0,
      Number(invoice.grandTotal || 0) - Number(invoice.balanceDue || 0),
    ),
  )

export const invoiceBelongsToCustomer = (invoice, customer) => {
  if (invoice.customerId) {
    return String(invoice.customerId) === String(customer.id)
  }

  const customerPhone = String(customer.phone || '').trim()
  const invoicePhone = String(invoice.customer?.phone || '').trim()
  if (customerPhone && invoicePhone) {
    return customerPhone === invoicePhone
  }

  return (
    String(customer.name || '').trim().toLocaleLowerCase() ===
    String(invoice.customer?.name || '').trim().toLocaleLowerCase()
  )
}

export const globalSearch = async (req, res) => {
  try {
    const query = String(req.query.q || '').trim()
    if (query.length < 2) {
      return res.json({ invoices: [], customers: [], products: [] })
    }

    const [invoices, customers, products] = await Promise.all([
      listInvoices({ search: query, page: 1, limit: 6 }),
      listCatalogRecords('customers', {
        search: query,
        page: 1,
        limit: 6,
      }),
      listCatalogRecords('products', {
        search: query,
        page: 1,
        limit: 6,
      }),
    ])

    res.json({
      invoices: invoices.items,
      customers: customers.items,
      products: products.items,
    })
  } catch (error) {
    res.status(400).json({ message: error.message || 'Search failed' })
  }
}

export const getNotifications = async (_req, res) => {
  try {
    const [invoices, products, auditLogs] = await Promise.all([
      getAllInvoices(),
      getAllCatalogRecords('products'),
      getAllAuditLogs(),
    ])
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const activeInvoices = invoices.filter(
      (invoice) =>
        !invoice.deletedAt &&
        !['draft', 'cancelled', 'paid'].includes(resolvedStatus(invoice)) &&
        Number(invoice.balanceDue || 0) > 0,
    )
    const allOverdue = activeInvoices
      .filter((invoice) => new Date(invoice.dueDate) < now)
      .sort((left, right) => new Date(left.dueDate) - new Date(right.dueDate))
    const allOutstanding = [...activeInvoices].sort(
      (left, right) =>
        Number(right.balanceDue || 0) - Number(left.balanceDue || 0),
    )
    const allLowStock = products
      .filter(
        (product) =>
          !product.deletedAt &&
          Number(product.stockQuantity || 0) <=
            Number(product.lowStockThreshold ?? 5),
      )
      .sort(
        (left, right) =>
          Number(left.stockQuantity || 0) - Number(right.stockQuantity || 0),
      )

    res.json({
      counts: {
        overdue: allOverdue.length,
        outstanding: allOutstanding.length,
        lowStock: allLowStock.length,
      },
      overdue: allOverdue.slice(0, 10),
      outstanding: allOutstanding.slice(0, 10),
      lowStock: allLowStock.slice(0, 10),
      activity: auditLogs.slice(0, 10),
    })
  } catch (error) {
    res.status(400).json({
      message: error.message || 'Unable to load notifications',
    })
  }
}

export const getCustomerStatement = async (req, res) => {
  try {
    const customer = await findCatalogRecord('customers', req.params.id)
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' })
    }

    const from = req.query.from ? new Date(req.query.from) : null
    const to = req.query.to ? new Date(req.query.to) : null
    if (to) to.setHours(23, 59, 59, 999)

    const invoices = (await getAllInvoices())
      .filter((invoice) => !invoice.deletedAt)
      .filter((invoice) => invoiceBelongsToCustomer(invoice, customer))
      .filter((invoice) => {
        const date = new Date(invoice.invoiceDate)
        return (!from || date >= from) && (!to || date <= to)
      })
      .sort(
        (left, right) =>
          new Date(right.invoiceDate) - new Date(left.invoiceDate),
      )

    res.json({
      customer,
      invoices,
      totals: {
        invoiced: invoices.reduce(
          (sum, invoice) => sum + Number(invoice.grandTotal || 0),
          0,
        ),
        paid: invoices.reduce(
          (sum, invoice) => sum + paidAmount(invoice),
          0,
        ),
        balance: invoices.reduce(
          (sum, invoice) => sum + Number(invoice.balanceDue || 0),
          0,
        ),
      },
    })
  } catch (error) {
    res.status(400).json({
      message: error.message || 'Unable to load customer statement',
    })
  }
}

export const getPaymentReceipt = async (req, res) => {
  try {
    const invoice = await findInvoiceById(req.params.id)
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' })
    }
    const payments = invoice.payments || []
    const paymentIndex = payments.findIndex(
      (item) => String(item.id) === String(req.params.paymentId),
    )
    const payment = payments[paymentIndex]
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' })
    }
    const paidThroughReceipt =
      Number(invoice.depositAmount || 0) +
      payments
        .slice(0, paymentIndex + 1)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    res.json({
      invoice,
      payment,
      balanceAfterPayment: Math.max(
        0,
        Number(invoice.grandTotal || 0) - paidThroughReceipt,
      ),
      settings: await getSystemSettings(),
    })
  } catch (error) {
    res.status(400).json({
      message: error.message || 'Unable to load payment receipt',
    })
  }
}
