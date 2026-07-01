import { randomUUID } from 'node:crypto'
import { DataTypes } from 'sequelize'
import { getStorageMode, sequelize } from '../config/database.js'
import Invoice from '../models/Invoice.js'
import InvoiceItem from '../models/InvoiceItem.js'
import InvoicePayment from '../models/InvoicePayment.js'
import Product from '../models/Product.js'
import StockMovement from '../models/StockMovement.js'
import { backfillLocalShareTokens } from '../repositories/invoiceRepository.js'
import { createShareToken } from '../utils/shareToken.js'

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const normalizedId = (id, fallback) => {
  const value = String(id || '').trim()
  return value && value.length <= 64 ? value : fallback
}

const normalizedUuid = (id) =>
  uuidPattern.test(String(id || '')) ? String(id) : null

const ensureNormalizedSchema = async () => {
  const queryInterface = sequelize.getQueryInterface()
  const invoiceTable = Invoice.getTableName()

  await InvoiceItem.sync()
  await InvoicePayment.sync()
  await StockMovement.sync()

  const invoiceColumns = await queryInterface.describeTable(invoiceTable)
  if (!invoiceColumns.stockApplied) {
    await queryInterface.addColumn(invoiceTable, 'stockApplied', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })
  }
}

const backfillInvoiceChildren = async (invoice) => {
  const itemCount = await InvoiceItem.count({ where: { invoiceId: invoice.id } })
  if (!itemCount && Array.isArray(invoice.items) && invoice.items.length) {
    await InvoiceItem.bulkCreate(
      invoice.items.map((item, index) => ({
        id: normalizedId(item.id, randomUUID()),
        invoiceId: invoice.id,
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
      })),
    )
  }

  const paymentCount = await InvoicePayment.count({
    where: { invoiceId: invoice.id },
  })
  if (!paymentCount && Array.isArray(invoice.payments) && invoice.payments.length) {
    await InvoicePayment.bulkCreate(
      invoice.payments.map((payment) => ({
        id: normalizedId(payment.id, randomUUID()),
        invoiceId: invoice.id,
        amount: Number(payment.amount || 0),
        paidAt: payment.paidAt || payment.createdAt || invoice.invoiceDate,
        receivedBy: String(payment.receivedBy || '').trim(),
        note: String(payment.note || '').trim(),
        recordedBy: String(payment.recordedBy || '').trim(),
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      })),
    )
  }
}

const backfillStockMovements = async (product) => {
  const count = await StockMovement.count({ where: { productId: product.id } })
  if (count || !Array.isArray(product.stockMovements)) return
  const movements = product.stockMovements.filter(Boolean)
  if (!movements.length) return

  await StockMovement.bulkCreate(
    movements.map((movement) => ({
      id: normalizedId(movement.id, randomUUID()),
      productId: product.id,
      invoiceId: normalizedUuid(movement.invoiceId),
      type: ['in', 'out', 'set'].includes(movement.type)
        ? movement.type
        : 'in',
      quantity: Number(movement.quantity || 0),
      previousStock: Number(movement.previousStock || 0),
      resultingStock: Number(movement.resultingStock || 0),
      note: String(movement.note || '').trim(),
      recordedBy: String(movement.recordedBy || '').trim(),
      recordedAt: movement.recordedAt || product.updatedAt || new Date(),
      source: ['manual', 'invoice', 'restore', 'migration'].includes(
        movement.source,
      )
        ? movement.source
        : 'migration',
      referenceNumber: String(movement.referenceNumber || '').trim(),
      createdAt: movement.createdAt,
      updatedAt: movement.updatedAt,
    })),
  )
}

export const migrateExistingData = async () => {
  if (getStorageMode() !== 'mysql') {
    const tokenCount = await backfillLocalShareTokens()
    if (tokenCount > 0) {
      console.log(`Generated share tokens for ${tokenCount} local invoice records`)
    }
    return
  }

  await ensureNormalizedSchema()

  const invoices = await Invoice.findAll()
  let updated = 0
  for (const invoice of invoices) {
    const changes = {}
    if (!invoice.shareToken) changes.shareToken = createShareToken()
    if (!Array.isArray(invoice.items)) changes.items = []
    if (!Array.isArray(invoice.payments)) changes.payments = []
    if (!invoice.salesChannel) changes.salesChannel = 'store'
    if (!invoice.salesperson) changes.salesperson = { name: '', phone: '' }
    if (invoice.stockApplied === undefined || invoice.stockApplied === null) {
      changes.stockApplied = false
    }

    if (Object.keys(changes).length) {
      await invoice.update(changes)
      updated += 1
    }
    await backfillInvoiceChildren(invoice)
  }
  const products = await Product.findAll()
  for (const product of products) {
    await backfillStockMovements(product)
  }
  if (updated > 0) {
    console.log(`Migrated ${updated} existing invoice records`)
  }
}
