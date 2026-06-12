import { randomUUID } from 'node:crypto'
import { getStorageMode, sequelize } from '../config/database.js'
import AuditLog from '../models/AuditLog.js'
import Counter from '../models/Counter.js'
import Customer from '../models/Customer.js'
import Invoice from '../models/Invoice.js'
import Product from '../models/Product.js'
import Salesperson from '../models/Salesperson.js'
import SystemSetting from '../models/SystemSetting.js'
import { getAllAdminsForBackup } from '../repositories/adminRepository.js'
import {
  findBackupSnapshotById,
  findBackupSnapshotForDate,
  listBackupSnapshots,
  pruneAutomaticBackupSnapshots,
  saveBackupSnapshot,
} from '../repositories/backupRepository.js'
import {
  getAllAuditLogs,
  writeAuditLog,
} from '../repositories/auditRepository.js'
import { getAllCatalogRecords } from '../repositories/catalogRepository.js'
import { getAllInvoices } from '../repositories/invoiceRepository.js'
import {
  defaultSystemSettings,
  getSystemSettings,
} from '../repositories/settingsRepository.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from '../repositories/localStore.js'

export const BACKUP_FORMAT_VERSION = 3

const backupCollectionNames = [
  'invoices',
  'customers',
  'products',
  'salespeople',
  'auditLogs',
  'counters',
]

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const clone = (value) => JSON.parse(JSON.stringify(value ?? null))

const normalizeLegacyIds = (value) => {
  if (Array.isArray(value)) return value.map(normalizeLegacyIds)
  if (!value || typeof value !== 'object') return value
  const normalized = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === '__v') continue
    if (key === '_id') {
      if (normalized.id === undefined) normalized.id = item
      continue
    }
    normalized[key] = normalizeLegacyIds(item)
  }
  return normalized
}

const cleanPlainRecord = (record) => normalizeLegacyIds(clone(record) || {})

const countsForPayload = (payload) => ({
  invoices: payload.invoices.length,
  customers: payload.customers.length,
  products: payload.products.length,
  salespeople: payload.salespeople.length,
  auditLogs: payload.auditLogs.length,
  counters: payload.counters.length,
  admins: payload.admins.length,
  settings: payload.settings ? 1 : 0,
})

const readCounters = async () => {
  if (getStorageMode() === 'mysql') return Counter.findAll({ raw: true })
  return readLocalCollection('counters')
}

const deriveCountersFromInvoices = (invoices = []) => {
  const counters = new Map()
  for (const invoice of invoices) {
    const match = String(invoice.invoiceNumber || '').match(
      /^INV-(\d{4})-(\d{5})$/,
    )
    if (!match) continue
    const counterId = `invoice-${match[1]}`
    counters.set(
      counterId,
      Math.max(counters.get(counterId) || 0, Number(match[2])),
    )
  }
  return Array.from(counters.entries()).map(([id, sequence]) => ({
    id,
    sequence,
  }))
}

const normalizeArray = (payload, key) => {
  if (!Array.isArray(payload[key])) {
    throw new Error(`Backup is missing ${key}`)
  }
  return payload[key].map(cleanPlainRecord)
}

const mappedId = (id, map) => {
  if (!id) return null
  if (map.has(String(id))) return map.get(String(id))
  const nextId = uuidPattern.test(String(id)) ? String(id) : randomUUID()
  map.set(String(id), nextId)
  return nextId
}

const mapRecordIds = (records) => {
  const map = new Map()
  const values = records.map((record) => ({
    ...record,
    id: mappedId(record.id, map) || randomUUID(),
  }))
  return { map, values }
}

const prepareRelationalBackup = (backup) => {
  const customers = mapRecordIds(backup.customers)
  const products = mapRecordIds(backup.products)
  const salespeople = mapRecordIds(backup.salespeople)
  const invoices = mapRecordIds(backup.invoices)
  const auditLogs = mapRecordIds(backup.auditLogs)

  return {
    ...backup,
    customers: customers.values,
    salespeople: salespeople.values,
    products: products.values.map((product) => ({
      ...product,
      stockMovements: (product.stockMovements || []).map((movement) => ({
        ...movement,
        id: uuidPattern.test(String(movement.id || ''))
          ? movement.id
          : randomUUID(),
      })),
    })),
    invoices: invoices.values.map((invoice) => ({
      ...invoice,
      customerId: invoice.customerId
        ? mappedId(invoice.customerId, customers.map)
        : null,
      salespersonId: invoice.salespersonId
        ? mappedId(invoice.salespersonId, salespeople.map)
        : null,
      items: (invoice.items || []).map((item) => ({
        ...item,
        id: uuidPattern.test(String(item.id || '')) ? item.id : randomUUID(),
        productId: item.productId
          ? mappedId(item.productId, products.map)
          : null,
      })),
      payments: (invoice.payments || []).map((payment) => ({
        ...payment,
        id: uuidPattern.test(String(payment.id || ''))
          ? payment.id
          : randomUUID(),
      })),
    })),
    auditLogs: auditLogs.values,
    counters: backup.counters.map((counter) => ({
      id: String(counter.id || ''),
      sequence: Number(counter.sequence || 0),
    })),
    settings: {
      ...backup.settings,
      id: uuidPattern.test(String(backup.settings?.id || ''))
        ? backup.settings.id
        : randomUUID(),
      key: 'default',
    },
  }
}

export const buildDatabaseBackup = async ({
  createdBy = 'system',
  source = 'manual',
} = {}) => {
  const [
    invoices,
    customers,
    products,
    salespeople,
    admins,
    auditLogs,
    settings,
    counters,
  ] = await Promise.all([
    getAllInvoices(),
    getAllCatalogRecords('customers'),
    getAllCatalogRecords('products'),
    getAllCatalogRecords('salespeople'),
    getAllAdminsForBackup(),
    getAllAuditLogs(),
    getSystemSettings(),
    readCounters(),
  ])

  const payload = {
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy,
      source,
      formatVersion: BACKUP_FORMAT_VERSION,
    },
    invoices: clone(invoices) || [],
    customers: clone(customers) || [],
    products: clone(products) || [],
    salespeople: clone(salespeople) || [],
    admins: clone(admins) || [],
    auditLogs: clone(auditLogs) || [],
    counters: clone(counters) || [],
    settings: clone(settings) || defaultSystemSettings,
  }
  payload.metadata.counts = countsForPayload(payload)
  return payload
}

export const normalizeBackupPayload = (payload) => {
  const backup = payload?.backup || payload
  if (!backup || typeof backup !== 'object') {
    throw new Error('Backup file is invalid')
  }

  const version = Number(backup.metadata?.formatVersion || 1)
  if (!Number.isFinite(version) || version < 1 || version > BACKUP_FORMAT_VERSION) {
    throw new Error('Backup format version is not supported')
  }

  const normalized = {
    metadata: { ...backup.metadata, formatVersion: version },
    invoices: normalizeArray(backup, 'invoices'),
    customers: normalizeArray(backup, 'customers'),
    products: normalizeArray(backup, 'products'),
    salespeople: normalizeArray(backup, 'salespeople'),
    auditLogs: Array.isArray(backup.auditLogs)
      ? backup.auditLogs.map(cleanPlainRecord)
      : [],
    admins: Array.isArray(backup.admins)
      ? backup.admins.map(cleanPlainRecord)
      : [],
    counters: Array.isArray(backup.counters)
      ? backup.counters.map(cleanPlainRecord)
      : deriveCountersFromInvoices(backup.invoices),
    settings: cleanPlainRecord({
      ...defaultSystemSettings,
      ...(Array.isArray(backup.settings) ? backup.settings[0] : backup.settings),
      key: 'default',
    }),
  }
  normalized.metadata.counts = countsForPayload(normalized)
  return prepareRelationalBackup(normalized)
}

const replaceLocalCollection = async (name, records) =>
  mutateLocalCollection(name, (current) => {
    current.splice(0, current.length, ...records.map(cleanPlainRecord))
    return current.length
  })

const restoreMysql = async (backup) =>
  sequelize.transaction(async (transaction) => {
    const options = { transaction }
    await Invoice.destroy({ where: {}, ...options })
    await Customer.destroy({ where: {}, ...options })
    await Product.destroy({ where: {}, ...options })
    await Salesperson.destroy({ where: {}, ...options })
    await AuditLog.destroy({ where: {}, ...options })
    await Counter.destroy({ where: {}, ...options })
    await SystemSetting.destroy({ where: {}, ...options })

    if (backup.customers.length) {
      await Customer.bulkCreate(backup.customers, options)
    }
    if (backup.products.length) {
      await Product.bulkCreate(backup.products, options)
    }
    if (backup.salespeople.length) {
      await Salesperson.bulkCreate(backup.salespeople, options)
    }
    if (backup.invoices.length) {
      await Invoice.bulkCreate(backup.invoices, options)
    }
    if (backup.auditLogs.length) {
      await AuditLog.bulkCreate(backup.auditLogs, options)
    }
    if (backup.counters.length) {
      await Counter.bulkCreate(backup.counters, options)
    }
    await SystemSetting.create(backup.settings, options)
  })

const restoreLocal = async (backup) => {
  await replaceLocalCollection('invoices', backup.invoices)
  await replaceLocalCollection('customers', backup.customers)
  await replaceLocalCollection('products', backup.products)
  await replaceLocalCollection('salespeople', backup.salespeople)
  await replaceLocalCollection('audit-logs', backup.auditLogs)
  await replaceLocalCollection('counters', backup.counters)
  await replaceLocalCollection('system-settings', [backup.settings])
}

export const createBackupSnapshot = async ({
  type = 'manual',
  createdBy = 'system',
  reason = '',
  audit = true,
} = {}) => {
  const payload = await buildDatabaseBackup({ createdBy, source: type })
  const snapshot = await saveBackupSnapshot({
    type,
    label: `Jotun backup ${payload.metadata.createdAt.slice(0, 10)}`,
    createdBy,
    reason,
    counts: payload.metadata.counts,
    payload,
  })

  if (audit) {
    await writeAuditLog({
      actor: { username: createdBy },
      action: 'backup',
      entityType: 'database',
      entityId: snapshot.id,
      summary:
        type === 'automatic'
          ? 'Automatic daily backup'
          : type === 'pre_restore'
            ? 'Pre-restore safety backup'
            : 'Manual backup snapshot',
      details: { type, counts: payload.metadata.counts },
    })
  }

  const plain =
    typeof snapshot.get === 'function' ? snapshot.get({ plain: true }) : snapshot
  const { payload: _payload, ...summary } = plain
  return summary
}

export const listDatabaseBackups = async (options = {}) =>
  listBackupSnapshots(options)

export const getBackupDownloadPayload = async (id) => {
  const snapshot = await findBackupSnapshotById(id)
  if (!snapshot) return null
  return { snapshot, payload: snapshot.payload }
}

export const restoreDatabaseBackup = async (
  payload,
  { actor, sourceSnapshotId = '' } = {},
) => {
  const backup = normalizeBackupPayload(payload)
  const actorName = actor?.username || 'system'
  const safetySnapshot = await createBackupSnapshot({
    type: 'pre_restore',
    createdBy: actorName,
    reason: sourceSnapshotId
      ? `Before restoring snapshot ${sourceSnapshotId}`
      : 'Before restoring uploaded backup',
  })

  if (getStorageMode() === 'mysql') await restoreMysql(backup)
  else await restoreLocal(backup)

  await writeAuditLog({
    actor,
    action: 'restore_backup',
    entityType: 'database',
    entityId: sourceSnapshotId,
    summary: 'Database restored from backup',
    details: {
      sourceSnapshotId,
      safetySnapshotId: safetySnapshot.id,
      counts: backup.metadata.counts,
      restoredCollections: backupCollectionNames,
      skippedCollections: ['admins', 'backup-snapshots'],
    },
  })

  return { counts: backup.metadata.counts, safetySnapshot }
}

export const restoreDatabaseBackupSnapshot = async (id, { actor } = {}) => {
  const snapshot = await findBackupSnapshotById(id)
  if (!snapshot) return null
  return restoreDatabaseBackup(snapshot.payload, {
    actor,
    sourceSnapshotId: id,
  })
}

export const hasAutomaticBackupForDate = (dateKey) =>
  findBackupSnapshotForDate('automatic', dateKey)

export const pruneOldAutomaticBackups = async (retentionDays) => {
  const days = Math.max(1, Number(retentionDays) || 30)
  const beforeDate = new Date()
  beforeDate.setDate(beforeDate.getDate() - days)
  return pruneAutomaticBackupSnapshots(beforeDate)
}
