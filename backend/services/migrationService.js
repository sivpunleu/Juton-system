import { getStorageMode } from '../config/database.js'
import Invoice from '../models/Invoice.js'
import { backfillLocalShareTokens } from '../repositories/invoiceRepository.js'
import { createShareToken } from '../utils/shareToken.js'

export const migrateExistingData = async () => {
  if (getStorageMode() !== 'mysql') {
    const tokenCount = await backfillLocalShareTokens()
    if (tokenCount > 0) {
      console.log(`Generated share tokens for ${tokenCount} local invoice records`)
    }
    return
  }

  const invoices = await Invoice.findAll()
  let updated = 0
  for (const invoice of invoices) {
    const changes = {}
    if (!invoice.shareToken) changes.shareToken = createShareToken()
    if (!Array.isArray(invoice.items)) changes.items = []
    if (!Array.isArray(invoice.payments)) changes.payments = []
    if (!invoice.salesChannel) changes.salesChannel = 'store'
    if (!invoice.salesperson) changes.salesperson = { name: '', phone: '' }

    if (Object.keys(changes).length) {
      await invoice.update(changes)
      updated += 1
    }
  }
  if (updated > 0) {
    console.log(`Migrated ${updated} existing invoice records`)
  }
}
