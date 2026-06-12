import { getStorageMode } from '../config/database.js'
import SystemSetting from '../models/SystemSetting.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

export const defaultSystemSettings = {
  key: 'default',
  companyName: 'Marvel Decor & JOTUN',
  companyNameKh: 'ម៉ាវែល ដេគ័រ & JOTUN',
  address: '',
  telegram: '068 8888 70',
  phones: ['098 689 883', '068 888 870'],
  paymentAccount: 'ABA : 068 888 187',
  invoiceNotes:
    '- ទំនិញទិញហើយមិនអាចប្ដូរ ឬសងត្រឡប់វិញបានទេ\n- រាល់ការទូទាត់ត្រូវមានវិក្កយបត្រត្រឹមត្រូវ',
  footerKh: 'សូមអរគុណចំពោះការគាំទ្រ !',
  footerEn: 'Thank you for support !',
  logo: '',
  jotunLogo: '',
  paymentQr: '',
  sellerSignature: '',
  updatedBy: '',
}

export const getSystemSettings = async () => {
  if (getStorageMode() === 'mysql') {
    const settings = await SystemSetting.findOne({
      where: { key: 'default' },
      raw: true,
    })
    return { ...defaultSystemSettings, ...(settings || {}) }
  }
  const [settings] = await readLocalCollection('system-settings')
  return { ...defaultSystemSettings, ...(settings || {}) }
}

export const saveSystemSettings = async (payload) => {
  if (getStorageMode() === 'mysql') {
    const [settings] = await SystemSetting.findOrCreate({
      where: { key: 'default' },
      defaults: { ...defaultSystemSettings, ...payload, key: 'default' },
    })
    return settings.update({ ...payload, key: 'default' })
  }
  return mutateLocalCollection('system-settings', (records) => {
    const timestamp = new Date().toISOString()
    const existing = records[0] || {
      ...defaultSystemSettings,
      id: 'default',
      createdAt: timestamp,
    }
    const settings = {
      ...existing,
      ...payload,
      key: 'default',
      id: existing.id || 'default',
      updatedAt: timestamp,
    }
    records.splice(0, records.length, settings)
    return settings
  })
}
