import assert from 'node:assert/strict'
import test from 'node:test'
import Admin from '../models/Admin.js'
import AuditLog from '../models/AuditLog.js'
import BackupSnapshot from '../models/BackupSnapshot.js'
import Customer from '../models/Customer.js'
import CustomerAccount from '../models/CustomerAccount.js'
import Invoice from '../models/Invoice.js'
import InvoiceItem from '../models/InvoiceItem.js'
import InvoicePayment from '../models/InvoicePayment.js'
import Order from '../models/Order.js'
import OrderItem from '../models/OrderItem.js'
import Product from '../models/Product.js'
import Salesperson from '../models/Salesperson.js'
import StockMovement from '../models/StockMovement.js'
import SystemSetting from '../models/SystemSetting.js'

const models = [
  Admin,
  AuditLog,
  BackupSnapshot,
  Customer,
  CustomerAccount,
  Invoice,
  InvoiceItem,
  InvoicePayment,
  Order,
  OrderItem,
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
