import assert from 'node:assert/strict'
import test from 'node:test'
import { invoiceBelongsToCustomer } from '../controllers/insightController.js'

const customer = {
  id: 'customer-1',
  name: 'Sok Dara',
  phone: '012 345 678',
}

test('customer statement uses customerId when an invoice has one', () => {
  assert.equal(
    invoiceBelongsToCustomer(
      {
        customerId: 'customer-2',
        customer: {
          name: customer.name,
          phone: customer.phone,
        },
      },
      customer,
    ),
    false,
  )
})

test('customer statement falls back to snapshot data for legacy invoices', () => {
  assert.equal(
    invoiceBelongsToCustomer(
      {
        customerId: null,
        customer: {
          name: customer.name,
          phone: customer.phone,
        },
      },
      customer,
    ),
    true,
  )
})

test('customer statement does not merge matching names with different phones', () => {
  assert.equal(
    invoiceBelongsToCustomer(
      {
        customerId: null,
        customer: {
          name: customer.name,
          phone: '099 999 999',
        },
      },
      customer,
    ),
    false,
  )
})
