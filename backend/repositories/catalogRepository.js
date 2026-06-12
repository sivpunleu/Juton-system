import { randomUUID } from 'node:crypto'
import { Op } from 'sequelize'
import { getStorageMode, sequelize } from '../config/database.js'
import Customer from '../models/Customer.js'
import Product from '../models/Product.js'
import Salesperson from '../models/Salesperson.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

const catalogConfig = {
  customers: { Model: Customer, duplicateField: null },
  products: { Model: Product, duplicateField: 'itemCode' },
  salespeople: { Model: Salesperson, duplicateField: null },
}

const getConfig = (type) => {
  const config = catalogConfig[type]
  if (!config) throw new Error('Unknown catalogue type')
  return config
}

const searchFields = (type) =>
  type === 'products'
    ? ['name', 'itemCode', 'colorCode']
    : type === 'customers'
      ? ['name', 'phone', 'address']
      : ['name', 'phone', 'notes']

const matchesSearch = (record, search, fields) => {
  const query = String(search || '').toLocaleLowerCase()
  if (!query) return true
  return fields.some((field) =>
    String(record[field] || '').toLocaleLowerCase().includes(query),
  )
}

const duplicateError = (field) => {
  const error = new Error(`${field} already exists`)
  error.code = 11000
  return error
}

export const listCatalogRecords = async (
  type,
  { search = '', page = 1, limit = 20, deleted = false } = {},
) => {
  const { Model } = getConfig(type)
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedLimit = Math.min(100, Math.max(1, Number(limit) || 20))

  if (getStorageMode() === 'mysql') {
    const query = String(search || '').trim()
    const where = {
      deletedAt: deleted ? { [Op.not]: null } : null,
      ...(query
        ? {
            [Op.or]: searchFields(type).map((field) => ({
              [field]: { [Op.like]: `%${query}%` },
            })),
          }
        : {}),
    }
    const { rows: items, count: total } = await Model.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset: (normalizedPage - 1) * normalizedLimit,
      limit: normalizedLimit,
    })
    return { items, total, page: normalizedPage, limit: normalizedLimit }
  }

  const records = (await readLocalCollection(type))
    .filter((record) =>
      deleted ? Boolean(record.deletedAt) : !record.deletedAt,
    )
    .filter((record) => matchesSearch(record, search, searchFields(type)))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
  const offset = (normalizedPage - 1) * normalizedLimit
  return {
    items: records.slice(offset, offset + normalizedLimit),
    total: records.length,
    page: normalizedPage,
    limit: normalizedLimit,
  }
}

export const findCatalogRecord = async (type, id) => {
  const { Model } = getConfig(type)
  if (getStorageMode() === 'mysql') {
    return Model.findOne({ where: { id, deletedAt: null } })
  }
  const records = await readLocalCollection(type)
  return (
    records.find(
      (record) => String(record.id) === String(id) && !record.deletedAt,
    ) || null
  )
}

export const createCatalogRecord = async (type, payload) => {
  const { Model, duplicateField } = getConfig(type)
  if (getStorageMode() === 'mysql') return Model.create(payload)

  return mutateLocalCollection(type, (records) => {
    if (
      duplicateField &&
      payload[duplicateField] &&
      records.some(
        (record) =>
          !record.deletedAt &&
          String(record[duplicateField] || '').toUpperCase() ===
            String(payload[duplicateField]).toUpperCase(),
      )
    ) {
      throw duplicateError(duplicateField)
    }
    const timestamp = new Date().toISOString()
    const record = {
      ...payload,
      id: randomUUID(),
      deletedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    records.push(record)
    return record
  })
}

export const updateCatalogRecord = async (type, id, payload) => {
  const { Model, duplicateField } = getConfig(type)
  if (getStorageMode() === 'mysql') {
    const record = await Model.findOne({ where: { id, deletedAt: null } })
    if (!record) return null
    return record.update(payload)
  }

  return mutateLocalCollection(type, (records) => {
    const index = records.findIndex(
      (record) => String(record.id) === String(id) && !record.deletedAt,
    )
    if (index === -1) return null
    if (
      duplicateField &&
      payload[duplicateField] &&
      records.some(
        (record, recordIndex) =>
          recordIndex !== index &&
          !record.deletedAt &&
          String(record[duplicateField] || '').toUpperCase() ===
            String(payload[duplicateField]).toUpperCase(),
      )
    ) {
      throw duplicateError(duplicateField)
    }
    records[index] = {
      ...records[index],
      ...payload,
      updatedAt: new Date().toISOString(),
    }
    return records[index]
  })
}

export const deleteCatalogRecord = async (type, id, actor) => {
  const { Model } = getConfig(type)
  const deletedAt = new Date()
  if (getStorageMode() === 'mysql') {
    const record = await Model.findOne({ where: { id, deletedAt: null } })
    if (!record) return null
    return record.update({ deletedAt, updatedBy: actor })
  }
  return mutateLocalCollection(type, (records) => {
    const record = records.find(
      (item) => String(item.id) === String(id) && !item.deletedAt,
    )
    if (!record) return null
    record.deletedAt = deletedAt.toISOString()
    record.updatedBy = actor
    record.updatedAt = deletedAt.toISOString()
    return record
  })
}

export const restoreCatalogRecord = async (type, id, actor) => {
  const { Model } = getConfig(type)
  if (getStorageMode() === 'mysql') {
    const record = await Model.findOne({
      where: { id, deletedAt: { [Op.not]: null } },
    })
    if (!record) return null
    return record.update({ deletedAt: null, updatedBy: actor })
  }
  return mutateLocalCollection(type, (records) => {
    const record = records.find(
      (item) => String(item.id) === String(id) && item.deletedAt,
    )
    if (!record) return null
    record.deletedAt = null
    record.updatedBy = actor
    record.updatedAt = new Date().toISOString()
    return record
  })
}

export const getAllCatalogRecords = async (type) => {
  const { Model } = getConfig(type)
  if (getStorageMode() === 'mysql') {
    return Model.findAll({ raw: true })
  }
  return readLocalCollection(type)
}

export const recordProductStockMovement = async (
  id,
  { type, quantity, note = '', actor = '' },
) => {
  const numericQuantity = Number(quantity)
  const applyMovement = (product) => {
    const previousStock = Number(product.stockQuantity || 0)
    const resultingStock =
      type === 'set'
        ? numericQuantity
        : type === 'in'
          ? previousStock + numericQuantity
          : previousStock - numericQuantity

    if (resultingStock < 0) {
      const error = new Error('Stock out cannot exceed current stock')
      error.statusCode = 400
      throw error
    }

    const timestamp = new Date().toISOString()
    const movement = {
      id: randomUUID(),
      type,
      quantity: numericQuantity,
      previousStock,
      resultingStock,
      note,
      recordedBy: actor,
      recordedAt: timestamp,
    }
    return { resultingStock, movement, timestamp }
  }

  if (getStorageMode() === 'mysql') {
    return sequelize.transaction(async (transaction) => {
      const product = await Product.findOne({
        where: { id, deletedAt: null },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
      if (!product) return null
      const { resultingStock, movement } = applyMovement(product)
      return product.update(
        {
          stockQuantity: resultingStock,
          stockMovements: [...(product.stockMovements || []), movement],
          updatedBy: actor,
        },
        { transaction },
      )
    })
  }

  return mutateLocalCollection('products', (products) => {
    const product = products.find(
      (item) => String(item.id) === String(id) && !item.deletedAt,
    )
    if (!product) return null
    const { resultingStock, movement, timestamp } = applyMovement(product)
    product.stockQuantity = resultingStock
    product.stockMovements = [...(product.stockMovements || []), movement]
    product.updatedBy = actor
    product.updatedAt = timestamp
    return product
  })
}
