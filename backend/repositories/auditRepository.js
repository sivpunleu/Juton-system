import { randomUUID } from 'node:crypto'
import { getStorageMode } from '../config/database.js'
import AuditLog from '../models/AuditLog.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

export const writeAuditLog = async ({
  actor,
  action,
  entityType,
  entityId = '',
  summary = '',
  details = {},
}) => {
  const payload = {
    actorId: String(actor?.id || ''),
    actorUsername: String(actor?.username || 'system'),
    action,
    entityType,
    entityId: String(entityId || ''),
    summary,
    details,
  }

  if (getStorageMode() === 'mysql') return AuditLog.create(payload)

  return mutateLocalCollection('audit-logs', (logs) => {
    const record = {
      ...payload,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    }
    logs.push(record)
    return record
  })
}

export const listAuditLogs = async ({
  page = 1,
  limit = 20,
  action = '',
  entityType = '',
  actorId = '',
  actorUsername = '',
} = {}) => {
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedLimit = Math.min(100, Math.max(1, Number(limit) || 20))

  if (getStorageMode() === 'mysql') {
    const where = {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(actorId ? { actorId: String(actorId) } : {}),
      ...(!actorId && actorUsername ? { actorUsername } : {}),
    }
    const { rows: items, count: total } = await AuditLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset: (normalizedPage - 1) * normalizedLimit,
      limit: normalizedLimit,
    })
    return { items, total, page: normalizedPage, limit: normalizedLimit }
  }

  const logs = (await readLocalCollection('audit-logs'))
    .filter((item) => !action || item.action === action)
    .filter((item) => !entityType || item.entityType === entityType)
    .filter((item) => !actorId || String(item.actorId) === String(actorId))
    .filter(
      (item) =>
        actorId ||
        !actorUsername ||
        item.actorUsername === actorUsername,
    )
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
  const offset = (normalizedPage - 1) * normalizedLimit
  return {
    items: logs.slice(offset, offset + normalizedLimit),
    total: logs.length,
    page: normalizedPage,
    limit: normalizedLimit,
  }
}

export const getAllAuditLogs = async () => {
  if (getStorageMode() === 'mysql') {
    return AuditLog.findAll({ order: [['createdAt', 'DESC']], raw: true })
  }
  return readLocalCollection('audit-logs')
}
