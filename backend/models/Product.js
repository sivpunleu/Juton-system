import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idField, textField } from './modelHelpers.js'

const Product = sequelize.define(
  'Product',
  {
    id: idField,
    name: {
      type: DataTypes.STRING(191),
      allowNull: false,
      validate: { notEmpty: { msg: 'Product name is required' } },
    },
    itemCode: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      set(value) {
        const code = String(value || '').trim().toUpperCase()
        this.setDataValue('itemCode', code || null)
      },
      get() {
        return this.getDataValue('itemCode') || ''
      },
    },
    colorCode: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    unit: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: { notEmpty: { msg: 'Product unit is required' } },
    },
    unitPrice: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    stockQuantity: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    lowStockThreshold: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 5,
      validate: { min: 0 },
    },
    stockMovements: { type: DataTypes.JSON, allowNull: true },
    notes: textField(),
    createdBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    updatedBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    deletedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  },
  {
    tableName: 'products',
    timestamps: true,
    indexes: [
      { fields: ['name'] },
      { fields: ['colorCode'] },
      { fields: ['deletedAt'] },
    ],
  },
)

export default Product
