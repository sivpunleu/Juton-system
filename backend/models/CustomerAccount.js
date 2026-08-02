import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import Customer from './Customer.js'
import { idField } from './modelHelpers.js'

const CustomerAccount = sequelize.define(
  'CustomerAccount',
  {
    id: idField,
    customerId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: Customer, key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    username: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true,
      set(value) {
        this.setDataValue('username', String(value || '').trim().toLowerCase())
      },
      validate: { notEmpty: true },
    },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  },
  {
    tableName: 'customer_accounts',
    timestamps: true,
    indexes: [{ fields: ['customerId'] }, { fields: ['username'] }],
  },
)

Customer.hasOne(CustomerAccount, {
  foreignKey: 'customerId',
  as: 'account',
})
CustomerAccount.belongsTo(Customer, {
  foreignKey: 'customerId',
  as: 'customer',
})

CustomerAccount.prototype.toJSON = function toJSON() {
  const values = { ...this.get() }
  delete values.passwordHash
  return values
}

export default CustomerAccount
