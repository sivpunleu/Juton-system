import { randomUUID } from 'node:crypto'
import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import Invoice from './Invoice.js'
import Product from './Product.js'
import { textField } from './modelHelpers.js'

const StockMovement = sequelize.define(
  'StockMovement',
  {
    id: {
      type: DataTypes.STRING(64),
      defaultValue: () => randomUUID(),
      primaryKey: true,
    },
    productId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Product, key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    invoiceId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: Invoice, key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    type: {
      type: DataTypes.ENUM('in', 'out', 'set'),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    previousStock: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    resultingStock: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    note: textField(),
    recordedBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    recordedAt: { type: DataTypes.DATE, allowNull: false },
    source: {
      type: DataTypes.ENUM('manual', 'invoice', 'restore', 'migration'),
      allowNull: false,
      defaultValue: 'manual',
    },
    referenceNumber: {
      type: DataTypes.STRING(80),
      allowNull: false,
      defaultValue: '',
    },
  },
  {
    tableName: 'stock_movements',
    timestamps: true,
    indexes: [
      { fields: ['productId', 'recordedAt'] },
      { fields: ['invoiceId'] },
      { fields: ['source'] },
    ],
  },
)

Product.hasMany(StockMovement, {
  foreignKey: 'productId',
  as: 'movementRows',
})
StockMovement.belongsTo(Product, {
  foreignKey: 'productId',
  as: 'product',
})
Invoice.hasMany(StockMovement, {
  foreignKey: 'invoiceId',
  as: 'stockMovementRows',
})
StockMovement.belongsTo(Invoice, {
  foreignKey: 'invoiceId',
  as: 'invoice',
})

export default StockMovement
