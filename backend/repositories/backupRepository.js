import { randomUUID } from 'node:crypto'
import { Op } from 'sequelize'
import { getStorageMode } from '../config/database.js'
import BackupSnapshot from '../models/BackupSnapshot.js'
import { asPlainObject } from '../models/modelHelpers.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

const withoutPayload = (snapshot) => {
  const plain = asPlainObject(snapshot)
  if (!plain) return null
  const { payload: _payload, ...summary } = plain
  return summary
}

export const saveBackupSnapshot = async ({
  type = 'manual',
  label = '',
  createdBy = 'system',
  reason = '',
  counts = {},
  payload,
}) => {
  if (getStorageMode() === 'mysql') {
    return BackupSnapshot.create({
      type,
      label,
      createdBy,
      reason,
      counts,
      payload,
    })
  }
  return mutateLocalCollection('backup-snapshots', (snapshots) => {
    const timestamp = new Date().toISOString()
    const snapshot = {
      id: randomUUID(),
      type,
      label,
      createdBy,
      reason,
      counts,
      payload,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    snapshots.push(snapshot)
    return snapshot
  })
}

export const listBackupSnapshots = async ({ limit = 20 } = {}) => {
  const normalizedLimit = Math.min(100, Math.max(1, Number(limit) || 20))
  if (getStorageMode() === 'mysql') {
    const snapshots = await BackupSnapshot.findAll({
      attributes: { exclude: ['payload'] },
      order: [['createdAt', 'DESC']],
      limit: normalizedLimit,
    })
    return snapshots.map(withoutPayload)
  }
  return (await readLocalCollection('backup-snapshots'))
    .map(withoutPayload)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, normalizedLimit)
}

export const findBackupSnapshotById = async (id) => {
  if (getStorageMode() === 'mysql') {
    return BackupSnapshot.findByPk(id, { raw: true })
  }
  return (
    (await readLocalCollection('backup-snapshots')).find(
      (snapshot) => String(snapshot.id) === String(id),
    ) || null
  )
}

export const findBackupSnapshotForDate = async (type, dateKey) => {
  const start = new Date(`${dateKey}T00:00:00.000Z`)
  const end = new Date(`${dateKey}T23:59:59.999Z`)
  if (getStorageMode() === 'mysql') {
    return BackupSnapshot.findOne({
      where: { type, createdAt: { [Op.between]: [start, end] } },
      raw: true,
    })
  }
  return (
    (await readLocalCollection('backup-snapshots')).find((snapshot) => {
      const createdAt = new Date(snapshot.createdAt)
      return snapshot.type === type && createdAt >= start && createdAt <= end
    }) || null
  )
}

export const pruneAutomaticBackupSnapshots = async (beforeDate) => {
  if (getStorageMode() === 'mysql') {
    return BackupSnapshot.destroy({
      where: {
        type: 'automatic',
        createdAt: { [Op.lt]: beforeDate },
      },
    })
  }
  return mutateLocalCollection('backup-snapshots', (snapshots) => {
    const before = new Date(beforeDate)
    const keep = snapshots.filter(
      (snapshot) =>
        snapshot.type !== 'automatic' || new Date(snapshot.createdAt) >= before,
    )
    const removed = snapshots.length - keep.length
    snapshots.splice(0, snapshots.length, ...keep)
    return removed
  })
}
