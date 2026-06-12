import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idField, textField } from './modelHelpers.js'

const Salesperson = sequelize.define(
  'Salesperson',
  {
    id: idField,
    name: {
      type: DataTypes.STRING(191),
      allowNull: false,
      validate: { notEmpty: { msg: 'Salesperson name is required' } },
    },
    phone: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '' },
    notes: textField(),
    createdBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    updatedBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    deletedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
  },
  {
    tableName: 'salespeople',
    timestamps: true,
    indexes: [{ fields: ['name'] }, { fields: ['deletedAt'] }],
  },
)

export default Salesperson
