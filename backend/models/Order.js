import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import Customer from './Customer.js'
import CustomerAccount from './CustomerAccount.js'
import { idField, textField } from './modelHelpers.js'

const Order = sequelize.define(
  'Order',
  {
    id: idField,
    orderNumber: {
      type: DataTypes.STRING(40),
      allowNull: false,
      unique: true,
      set(value) {
        this.setDataValue('orderNumber', String(value || '').trim().toUpperCase())
      },
      validate: { notEmpty: true },
    },
    customerAccountId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: CustomerAccount, key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Customer, key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    customer: { type: DataTypes.JSON, allowNull: false },
    items: { type: DataTypes.JSON, allowNull: false },
    subtotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    deliveryFee: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    grandTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    status: {
      type: DataTypes.ENUM('pending', 'confirmed', 'rejected', 'converted'),
      allowNull: false,
      defaultValue: 'pending',
    },
    customerNote: textField(),
    adminNote: textField(),
    processedBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    processedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    invoiceId: { type: DataTypes.UUID, allowNull: true, defaultValue: null },
  },
  {
    tableName: 'orders',
    timestamps: true,
    indexes: [
      { fields: ['customerAccountId', 'createdAt'] },
      { fields: ['status', 'createdAt'] },
      { fields: ['customerId'] },
      { fields: ['invoiceId'] },
    ],
  },
)

CustomerAccount.hasMany(Order, {
  foreignKey: 'customerAccountId',
  as: 'orders',
})
Order.belongsTo(CustomerAccount, {
  foreignKey: 'customerAccountId',
  as: 'customerAccount',
})
Customer.hasMany(Order, { foreignKey: 'customerId', as: 'orders' })
Order.belongsTo(Customer, { foreignKey: 'customerId', as: 'customerRecord' })

export default Order
