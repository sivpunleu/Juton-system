import { getAllCatalogRecords } from '../repositories/catalogRepository.js'
import { getAllInvoices } from '../repositories/invoiceRepository.js'
import { writeAuditLog } from '../repositories/auditRepository.js'
import {
  buildDatabaseBackup,
  createBackupSnapshot,
  getBackupDownloadPayload,
  listDatabaseBackups,
  restoreDatabaseBackup,
  restoreDatabaseBackupSnapshot,
} from '../services/backupService.js'

const csvValue = (value) => {
  const stringValue =
    value === undefined || value === null ? '' : String(value)
  return `"${stringValue.replace(/"/g, '""')}"`
}

const dateStamp = () => new Date().toISOString().slice(0, 10)

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100

const paidAmount = (invoice) =>
  Math.max(
    Number(invoice.paidAmount || 0),
    Math.max(
      0,
      Number(invoice.grandTotal || 0) - Number(invoice.balanceDue || 0),
    ),
  )

const resolvedStatus = (invoice) => {
  if (invoice.status) return invoice.status
  if (invoice.paymentStatus === 'partial') return 'partially_paid'
  return invoice.paymentStatus || 'unpaid'
}

const parseDateRange = (query) => {
  const now = new Date()
  const to = query.to ? new Date(query.to) : now
  const from = query.from
    ? new Date(query.from)
    : new Date(now.getFullYear(), now.getMonth(), 1)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error('Report date range is invalid')
  }
  from.setHours(0, 0, 0, 0)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

const groupKey = (dateValue, groupBy) => {
  const date = new Date(dateValue)
  if (groupBy === 'year') return String(date.getFullYear())
  if (groupBy === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }
  return date.toISOString().slice(0, 10)
}

export const getRevenueReport = async (req, res) => {
  try {
    const { from, to } = parseDateRange(req.query)
    const groupBy = ['day', 'month', 'year'].includes(req.query.groupBy)
      ? req.query.groupBy
      : 'day'
    const salesChannel = ['store', 'salesperson'].includes(
      req.query.salesChannel,
    )
      ? req.query.salesChannel
      : ''
    const salespersonId = String(req.query.salespersonId || '').trim()
    const invoices = (await getAllInvoices()).filter(
      (invoice) =>
        !invoice.deletedAt &&
        !['draft', 'cancelled'].includes(resolvedStatus(invoice)) &&
        (!salesChannel ||
          (invoice.salesChannel || 'store') === salesChannel) &&
        (!salespersonId ||
          String(invoice.salespersonId || '') === salespersonId),
    )
    const revenueEntries = []

    for (const invoice of invoices) {
      const invoiceDate = new Date(invoice.invoiceDate)
      const deposit = Number(invoice.depositAmount || 0)
      if (deposit > 0) {
        revenueEntries.push({
          date: invoiceDate,
          amount: deposit,
          invoiceNumber: invoice.invoiceNumber,
        })
      }

      const payments = Array.isArray(invoice.payments)
        ? invoice.payments
        : []
      for (const payment of payments) {
        revenueEntries.push({
          date: new Date(payment.paidAt || payment.createdAt),
          amount: Number(payment.amount || 0),
          invoiceNumber: invoice.invoiceNumber,
        })
      }

      const recordedPayments = payments.reduce(
        (sum, payment) => sum + Number(payment.amount || 0),
        0,
      )
      const knownRevenue = deposit + recordedPayments
      const effectivePaidAmount = paidAmount(invoice)
      const legacyRevenue = Math.max(
        0,
        effectivePaidAmount - knownRevenue,
      )
      if (legacyRevenue > 0) {
        revenueEntries.push({
          date: invoiceDate,
          amount: legacyRevenue,
          invoiceNumber: invoice.invoiceNumber,
        })
      }
    }

    const filteredEntries = revenueEntries.filter(
      (entry) => entry.date >= from && entry.date <= to,
    )
    const trendMap = new Map()
    for (const entry of filteredEntries) {
      const key = groupKey(entry.date, groupBy)
      trendMap.set(key, roundMoney((trendMap.get(key) || 0) + entry.amount))
    }

    const periodInvoices = invoices.filter((invoice) => {
      const date = new Date(invoice.invoiceDate)
      return date >= from && date <= to
    })
    const trend = Array.from(trendMap.entries())
      .map(([label, revenue]) => ({ label, revenue }))
      .sort((left, right) => left.label.localeCompare(right.label))
    const salesMap = new Map()
    for (const invoice of periodInvoices) {
      const isSalesperson = invoice.salesChannel === 'salesperson'
      const key = isSalesperson
        ? String(
            invoice.salespersonId ||
              invoice.salesperson?.name ||
              'unknown-salesperson',
          )
        : 'store'
      const current = salesMap.get(key) || {
        key,
        salesChannel: isSalesperson ? 'salesperson' : 'store',
        salespersonId: isSalesperson
          ? String(invoice.salespersonId || '')
          : '',
        label: isSalesperson
          ? invoice.salesperson?.name || 'Unknown Sale'
          : 'ទិញនៅហាងផ្ទាល់',
        invoiceCount: 0,
        invoiced: 0,
        paid: 0,
        outstanding: 0,
      }
      current.invoiceCount += 1
      current.invoiced += Number(invoice.grandTotal || 0)
      current.paid += paidAmount(invoice)
      current.outstanding += Number(invoice.balanceDue || 0)
      salesMap.set(key, current)
    }
    const salesPerformance = Array.from(salesMap.values())
      .map((item) => ({
        ...item,
        invoiced: roundMoney(item.invoiced),
        paid: roundMoney(item.paid),
        outstanding: roundMoney(item.outstanding),
      }))
      .sort((left, right) => right.invoiced - left.invoiced)
    const salesItemMap = new Map()
    for (const invoice of periodInvoices) {
      const isSalesperson = invoice.salesChannel === 'salesperson'
      const sourceKey = isSalesperson
        ? String(
            invoice.salespersonId ||
              invoice.salesperson?.name ||
              'unknown-salesperson',
          )
        : 'store'
      const sourceLabel = isSalesperson
        ? invoice.salesperson?.name || 'Unknown Sale'
        : 'ទិញនៅហាងផ្ទាល់'

      for (const item of invoice.items || []) {
        const itemKey = [
          sourceKey,
          item.productId || item.description,
          item.colorCode || '',
          item.unit || '',
        ].join('::')
        const current = salesItemMap.get(itemKey) || {
          key: itemKey,
          salesChannel: isSalesperson ? 'salesperson' : 'store',
          sourceLabel,
          productName: item.description,
          colorCode: item.colorCode || '',
          unit: item.unit || '',
          quantity: 0,
          amount: 0,
        }
        current.quantity += Number(item.quantity || 0)
        current.amount += Number(item.total || 0)
        salesItemMap.set(itemKey, current)
      }
    }
    const salesItems = Array.from(salesItemMap.values())
      .map((item) => ({
        ...item,
        quantity: roundMoney(item.quantity),
        amount: roundMoney(item.amount),
      }))
      .sort((left, right) => right.amount - left.amount)

    res.json({
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
        groupBy,
        salesChannel,
        salespersonId,
      },
      summary: {
        revenue: roundMoney(
          filteredEntries.reduce((sum, entry) => sum + entry.amount, 0),
        ),
        invoiced: roundMoney(
          periodInvoices.reduce(
            (sum, invoice) => sum + Number(invoice.grandTotal || 0),
            0,
          ),
        ),
        outstanding: roundMoney(
          periodInvoices.reduce(
            (sum, invoice) => sum + Number(invoice.balanceDue || 0),
            0,
          ),
        ),
        invoiceCount: periodInvoices.length,
      },
      trend,
      salesPerformance,
      salesItems,
      invoices: periodInvoices
        .sort(
          (left, right) =>
            new Date(right.invoiceDate) - new Date(left.invoiceDate),
        )
        .slice(0, 50),
    })
  } catch (error) {
    res.status(400).json({
      message: error.message || 'Unable to generate revenue report',
    })
  }
}

export const exportInvoicesCsv = async (req, res) => {
  try {
    const invoices = await getAllInvoices()
    const headers = [
      'Invoice Number',
      'Date',
      'Customer',
      'Phone',
      'Sales Channel',
      'Salesperson',
      'Status',
      'Subtotal',
      'Grand Total',
      'Paid Amount',
      'Balance Due',
      'Deleted At',
    ]
    const rows = invoices.map((invoice) => [
      invoice.invoiceNumber,
      invoice.invoiceDate,
      invoice.customer?.name,
      invoice.customer?.phone,
      invoice.salesChannel || 'store',
      invoice.salesChannel === 'salesperson'
        ? invoice.salesperson?.name || ''
        : 'In-store',
      invoice.status || invoice.paymentStatus,
      invoice.subtotal,
      invoice.grandTotal,
      invoice.paidAmount ??
        Number(invoice.grandTotal || 0) - Number(invoice.balanceDue || 0),
      invoice.balanceDue,
      invoice.deletedAt || '',
    ])
    const csv = [
      headers.map(csvValue).join(','),
      ...rows.map((row) => row.map(csvValue).join(',')),
    ].join('\r\n')

    await writeAuditLog({
      actor: req.admin,
      action: 'export_csv',
      entityType: 'invoice',
      summary: `${invoices.length} invoices`,
    })
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="invoices-${dateStamp()}.csv"`,
    })
    res.send(`\uFEFF${csv}`)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to export CSV' })
  }
}

export const exportDatabaseBackup = async (req, res) => {
  try {
    const backup = await buildDatabaseBackup({
      createdBy: req.admin.username,
      source: 'download',
    })

    await writeAuditLog({
      actor: req.admin,
      action: 'backup',
      entityType: 'database',
      summary: 'Full JSON backup',
    })
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="jotun-billing-backup-${dateStamp()}.json"`,
    })
    res.send(JSON.stringify(backup, null, 2))
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to create backup' })
  }
}

export const listBackupSnapshots = async (req, res) => {
  try {
    const items = await listDatabaseBackups({ limit: req.query.limit })
    res.json({
      items,
      automaticEnabled: process.env.AUTO_BACKUP_ENABLED !== 'false',
      retentionDays: Number(process.env.AUTO_BACKUP_RETENTION_DAYS || 30),
      backupTimeUtc: process.env.AUTO_BACKUP_TIME || '02:00',
    })
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to list backups' })
  }
}

export const createManualBackupSnapshot = async (req, res) => {
  try {
    const snapshot = await createBackupSnapshot({
      type: 'manual',
      createdBy: req.admin.username,
      reason: String(req.body.reason || '').trim(),
    })
    res.status(201).json(snapshot)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to create backup' })
  }
}

export const downloadBackupSnapshot = async (req, res) => {
  try {
    const result = await getBackupDownloadPayload(req.params.id)
    if (!result) {
      return res.status(404).json({ message: 'Backup snapshot not found' })
    }
    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="jotun-billing-snapshot-${dateStamp()}.json"`,
    })
    res.send(JSON.stringify(result.payload, null, 2))
  } catch (error) {
    res.status(500).json({ message: error.message || 'Unable to download backup' })
  }
}

export const restoreBackupSnapshot = async (req, res) => {
  try {
    const result = await restoreDatabaseBackupSnapshot(req.params.id, {
      actor: req.admin,
    })
    if (!result) {
      return res.status(404).json({ message: 'Backup snapshot not found' })
    }
    res.json({
      message: 'Database restored from backup snapshot',
      ...result,
    })
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to restore backup' })
  }
}

export const restoreUploadedBackup = async (req, res) => {
  try {
    const result = await restoreDatabaseBackup(req.body, {
      actor: req.admin,
    })
    res.json({
      message: 'Database restored from uploaded backup',
      ...result,
    })
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to restore backup' })
  }
}
