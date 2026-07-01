import { randomUUID } from 'node:crypto'
import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import Invoice from './Invoice.js'
import Product from './Product.js'

const InvoiceItem = sequelize.define(
  'InvoiceItem',
  {
    id: {
      type: DataTypes.STRING(64),
      defaultValue: () => randomUUID(),
      primaryKey: true,
    },
    invoiceId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Invoice, key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    productId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: Product, key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    description: {
      type: DataTypes.STRING(191),
      allowNull: false,
      validate: { notEmpty: true },
    },
    itemCode: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    colorCode: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    quantity: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    unit: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: { notEmpty: true },
    },
    unitPrice: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    discount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    total: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    sortOrder: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'invoice_items',
    timestamps: true,
    indexes: [
      { fields: ['invoiceId'] },
      { fields: ['productId'] },
      { fields: ['invoiceId', 'sortOrder'] },
    ],
  },
)

Invoice.hasMany(InvoiceItem, {
  foreignKey: 'invoiceId',
  as: 'itemRows',
})
InvoiceItem.belongsTo(Invoice, {
  foreignKey: 'invoiceId',
  as: 'invoice',
})
Product.hasMany(InvoiceItem, {
  foreignKey: 'productId',
  as: 'invoiceItemRows',
})
InvoiceItem.belongsTo(Product, {
  foreignKey: 'productId',
  as: 'product',
})

export default InvoiceItem
