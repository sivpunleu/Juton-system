import { randomUUID } from 'node:crypto'
import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import Invoice from './Invoice.js'
import { textField } from './modelHelpers.js'

const InvoicePayment = sequelize.define(
  'InvoicePayment',
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
    amount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    paidAt: { type: DataTypes.DATE, allowNull: false },
    receivedBy: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    note: textField(),
    recordedBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
  },
  {
    tableName: 'invoice_payments',
    timestamps: true,
    indexes: [
      { fields: ['invoiceId'] },
      { fields: ['paidAt'] },
    ],
  },
)

Invoice.hasMany(InvoicePayment, {
  foreignKey: 'invoiceId',
  as: 'paymentRows',
})
InvoicePayment.belongsTo(Invoice, {
  foreignKey: 'invoiceId',
  as: 'invoice',
})

export default InvoicePayment
