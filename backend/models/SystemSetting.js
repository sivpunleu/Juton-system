import { DataTypes } from 'sequelize'
import { sequelize } from '../config/database.js'
import { idField, textField } from './modelHelpers.js'

const SystemSetting = sequelize.define(
  'SystemSetting',
  {
    id: idField,
    key: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      defaultValue: 'default',
    },
    companyName: {
      type: DataTypes.STRING(191),
      allowNull: false,
      defaultValue: 'Marvel Decor & JOTUN',
    },
    companyNameKh: textField(),
    address: textField(),
    telegram: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
    phones: { type: DataTypes.JSON, allowNull: true },
    paymentAccount: textField(),
    invoiceNotes: textField(),
    footerKh: textField(),
    footerEn: textField(),
    logo: { type: DataTypes.TEXT('long'), allowNull: true },
    jotunLogo: { type: DataTypes.TEXT('long'), allowNull: true },
    paymentQr: { type: DataTypes.TEXT('long'), allowNull: true },
    sellerSignature: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    updatedBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
  },
  { tableName: 'system_settings', timestamps: true },
)

export default SystemSetting
