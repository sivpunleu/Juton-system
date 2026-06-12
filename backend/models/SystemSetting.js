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
    phones: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    paymentAccount: textField(),
    invoiceNotes: textField(),
    footerKh: textField(),
    footerEn: textField('Thank you for support !'),
    logo: { type: DataTypes.TEXT('long'), allowNull: false, defaultValue: '' },
    jotunLogo: { type: DataTypes.TEXT('long'), allowNull: false, defaultValue: '' },
    paymentQr: { type: DataTypes.TEXT('long'), allowNull: false, defaultValue: '' },
    sellerSignature: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      defaultValue: '',
    },
    updatedBy: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
  },
  { tableName: 'system_settings', timestamps: true },
)

export default SystemSetting
