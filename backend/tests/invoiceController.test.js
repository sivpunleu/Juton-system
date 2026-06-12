import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateTotals,
  normalizeSalesAttribution,
} from '../controllers/invoiceController.js'

test('calculateTotals calculates line items, discount, tax, and grand total', () => {
  const result = calculateTotals({
    items: [
      {
        description: 'Majestic True Beauty 5L',
        colorCode: '1024',
        quantity: 2,
        unit: 'ធុង',
        unitPrice: 40,
        discount: 5,
      },
      {
        description: 'Jotashield 1L',
        quantity: 1,
        unitPrice: 25.5,
      },
    ],
    discount: 10,
    taxRate: 10,
  })

  assert.equal(result.items[0].total, 75)
  assert.equal(result.items[0].unit, 'ធុង')
  assert.equal(result.items[1].total, 25.5)
  assert.equal(result.subtotal, 100.5)
  assert.equal(result.discount, 10)
  assert.equal(result.taxAmount, 9.05)
  assert.equal(result.grandTotal, 99.55)
  assert.equal(result.depositAmount, 0)
  assert.equal(result.balanceDue, 99.55)
})

test('calculateTotals includes delivery and subtracts the deposit from balance due', () => {
  const result = calculateTotals({
    items: [
      {
        description: 'Paint',
        quantity: 1,
        unitPrice: 403.5,
      },
    ],
    deliveryFee: 5,
    depositRate: 10,
  })

  assert.equal(result.grandTotal, 408.5)
  assert.equal(result.depositAmount, 40.85)
  assert.equal(result.balanceDue, 367.65)
})

test('calculateTotals rejects an item discount greater than the line total', () => {
  assert.throws(
    () =>
      calculateTotals({
        items: [
          {
            description: 'Paint',
            quantity: 1,
            unitPrice: 10,
            discount: 11,
          },
        ],
      }),
    /cannot exceed its line total/,
  )
})

test('calculateTotals rejects a non-numeric invoice discount', () => {
  assert.throws(
    () =>
      calculateTotals({
        items: [
          {
            description: 'Paint',
            quantity: 1,
            unitPrice: 10,
          },
        ],
        discount: 'not-a-number',
      }),
    /valid number/,
  )
})

test('normalizeSalesAttribution supports store and salesperson sales', () => {
  assert.deepEqual(normalizeSalesAttribution({ salesChannel: 'store' }), {
    salesChannel: 'store',
    salespersonId: null,
    salesperson: { name: '', phone: '' },
  })

  assert.deepEqual(
    normalizeSalesAttribution({
      salesChannel: 'salesperson',
      salespersonId: 'sale-1',
      salesperson: { name: 'Sokha', phone: '012 345 678' },
    }),
    {
      salesChannel: 'salesperson',
      salespersonId: 'sale-1',
      salesperson: { name: 'Sokha', phone: '012 345 678' },
    },
  )
})

test('normalizeSalesAttribution requires a selected salesperson', () => {
  assert.throws(
    () => normalizeSalesAttribution({ salesChannel: 'salesperson' }),
    /select a salesperson/,
  )
})
