import { DataTypes } from 'sequelize'

export const idField = {
  type: DataTypes.UUID,
  defaultValue: DataTypes.UUIDV4,
  primaryKey: true,
}

export const textField = (defaultValue = '') => ({
  type: DataTypes.TEXT,
  allowNull: false,
  defaultValue,
})

export const asPlainObject = (record) =>
  typeof record?.get === 'function' ? record.get({ plain: true }) : record
