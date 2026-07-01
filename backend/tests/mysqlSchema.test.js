import assert from 'node:assert/strict'
import test from 'node:test'
import Admin from '../models/Admin.js'
import AuditLog from '../models/AuditLog.js'
import BackupSnapshot from '../models/BackupSnapshot.js'
import Customer from '../models/Customer.js'
import Invoice from '../models/Invoice.js'
import InvoiceItem from '../models/InvoiceItem.js'
import InvoicePayment from '../models/InvoicePayment.js'
import Product from '../models/Product.js'
import Salesperson from '../models/Salesperson.js'
import StockMovement from '../models/StockMovement.js'
import SystemSetting from '../models/SystemSetting.js'

const models = [
  Admin,
  AuditLog,
  BackupSnapshot,
  Customer,
  Invoice,
  InvoiceItem,
  InvoicePayment,
  Product,
  Salesperson,
  StockMovement,
  SystemSetting,
]

test('MySQL TEXT and JSON columns do not declare unsupported defaults', () => {
  for (const Model of models) {
    for (const [name, attribute] of Object.entries(Model.rawAttributes)) {
      if (!['TEXT', 'JSON'].includes(attribute.type.key)) continue
      assert.equal(
        attribute.defaultValue,
        undefined,
        `${Model.name}.${name} must not declare a database default`,
      )
    }
  }
})
