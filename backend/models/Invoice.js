import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { createShareToken } from '../utils/shareToken.js'
import { idField, textField } from './modelHelpers.js'

const Invoice = sequelize.define(
  'Invoice',
  {
    id: idField,
    invoiceNumber: {
      type: DataTypes.STRING(40),
      allowNull: false,
      unique: true,
      set(value) {
        this.setDataValue(
          'invoiceNumber',
          String(value || '').trim().toUpperCase(),
        )
      },
      validate: { notEmpty: true },
    },
    shareToken: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      defaultValue: createShareToken,
    },
    invoiceDate: { type: DataTypes.DATE, allowNull: false },
    dueDate: { type: DataTypes.DATE, allowNull: false },
    customer: { type: DataTypes.JSON, allowNull: false },
    customerId: { type: DataTypes.STRING(36), allowNull: true },
    salesChannel: {
      type: DataTypes.ENUM('store', 'salesperson'),
      allowNull: false,
      defaultValue: 'store',
    },
    salespersonId: { type: DataTypes.STRING(36), allowNull: true },
    salesperson: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    items: {
      type: DataTypes.JSON,
      allowNull: false,
      validate: {
        hasItems(value) {
          if (!Array.isArray(value) || value.length === 0) {
            throw new Error('At least one invoice item is required')
          }
        },
      },
    },
    subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    discount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    taxRate: {
      type: DataTypes.DECIMAL(7, 2),
      allowNull: false,
      defaultValue: 0,
    },
    taxAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    deliveryFee: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    depositRate: {
      type: DataTypes.DECIMAL(7, 2),
      allowNull: false,
      defaultValue: 0,
    },
    depositAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    grandTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    balanceDue: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    paidAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM(
        'draft',
        'unpaid',
        'partially_paid',
        'paid',
        'cancelled',
      ),
      allowNull: false,
      defaultValue: 'unpaid',
    },
    paymentStatus: {
      type: DataTypes.ENUM('unpaid', 'partial', 'paid'),
      allowNull: false,
      defaultValue: 'unpaid',
    },
    payments: { type: DataTypes.JSON, allowNull: true },
    stockApplied: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    notes: textField(),
    createdBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    updatedBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    deletedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    deletedBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
  },
  {
    tableName: 'invoices',
    timestamps: true,
    indexes: [
      { fields: ['createdAt'] },
      { fields: ['deletedAt', 'createdAt'] },
      { fields: ['status'] },
      { fields: ['salesChannel', 'salespersonId', 'invoiceDate'] },
    ],
  },
)

export default Invoice
