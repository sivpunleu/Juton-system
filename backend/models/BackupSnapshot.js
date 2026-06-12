import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idField, textField } from './modelHelpers.js'

const BackupSnapshot = sequelize.define(
  'BackupSnapshot',
  {
    id: idField,
    type: {
      type: DataTypes.ENUM('manual', 'automatic', 'pre_restore'),
      allowNull: false,
      defaultValue: 'manual',
    },
    label: { type: DataTypes.STRING(191), allowNull: false, defaultValue: '' },
    createdBy: {
      type: DataTypes.STRING(80),
      allowNull: false,
      defaultValue: 'system',
    },
    reason: textField(),
    counts: { type: DataTypes.JSON, allowNull: true },
    payload: { type: DataTypes.JSON, allowNull: false },
  },
  {
    tableName: 'backup_snapshots',
    timestamps: true,
    indexes: [
      { fields: ['type'] },
      { fields: ['createdBy'] },
      { fields: ['createdAt'] },
    ],
  },
)

export default BackupSnapshot
