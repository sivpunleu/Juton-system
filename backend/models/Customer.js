import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idField, textField } from './modelHelpers.js'

const Customer = sequelize.define(
  'Customer',
  {
    id: idField,
    name: {
      type: DataTypes.STRING(191),
      allowNull: false,
      validate: { notEmpty: { msg: 'Customer name is required' } },
    },
    phone: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '' },
    address: textField(),
    notes: textField(),
    createdBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    updatedBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    deletedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  },
  {
    tableName: 'customers',
    timestamps: true,
    indexes: [
      { fields: ['name'] },
      { fields: ['phone'] },
      { fields: ['deletedAt'] },
    ],
  },
)

export default Customer
