import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idField, textField } from './modelHelpers.js'

const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: idField,
    actorId: { type: DataTypes.STRING(36), allowNull: false, defaultValue: '' },
    actorUsername: {
      type: DataTypes.STRING(80),
      allowNull: false,
      validate: { notEmpty: true },
    },
    action: {
      type: DataTypes.STRING(80),
      allowNull: false,
      validate: { notEmpty: true },
    },
    entityType: {
      type: DataTypes.STRING(80),
      allowNull: false,
      validate: { notEmpty: true },
    },
    entityId: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    summary: textField(),
    details: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  },
  {
    tableName: 'audit_logs',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['action'] },
      { fields: ['entityType'] },
      { fields: ['entityId'] },
      { fields: ['createdAt'] },
    ],
  },
)

export default AuditLog
