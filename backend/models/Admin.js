import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idField } from './modelHelpers.js'

const Admin = sequelize.define(
  'Admin',
  {
    id: idField,
    username: {
      type: DataTypes.STRING(80),
      allowNull: false,
      unique: true,
      set(value) {
        this.setDataValue('username', String(value || '').trim().toLowerCase())
      },
      validate: { notEmpty: true },
    },
    displayName: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
    avatar: { type: DataTypes.TEXT('long'), allowNull: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    role: {
      type: DataTypes.ENUM('owner', 'admin', 'viewer'),
      allowNull: false,
      defaultValue: 'admin',
    },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    createdBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
  },
  { tableName: 'admins', timestamps: true },
)

Admin.prototype.toJSON = function toJSON() {
  const values = { ...this.get() }
  delete values.passwordHash
  return values
}

export default Admin
