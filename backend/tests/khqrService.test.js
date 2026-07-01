import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attachKhqrPayment,
  crc16Ccitt,
  generateKhqrPayload,
} from '../services/khqrService.js'

test('crc16Ccitt matches the EMV payload checksum example', () => {
  assert.equal(crc16Ccitt('0002010102126304'), '43D8')
})

test('generateKhqrPayload creates a dynamic Bakong payload with invoice reference', () => {
  const payload = generateKhqrPayload({
    accountId: 'merchant@bakong',
    merchantName: 'Marvel Decor',
    merchantCity: 'PHNOM PENH',
    merchantCategoryCode: '5999',
    currency: '840',
    amount: 12.5,
    invoiceNumber: 'INV-2026-00001',
  })

  assert.match(payload, /^000201010212/)
  assert.match(payload, /2940/)
  assert.match(payload, /0017kh.gov.nbc.bakong/)
  assert.match(payload, /0115merchant@bakong/)
  assert.match(payload, /540512.50/)
  assert.match(payload, /62180114INV-2026-00001/)
  assert.match(payload, /6304[A-F0-9]{4}$/)
  assert.equal(
    payload.slice(-4),
    crc16Ccitt(payload.slice(0, -4)),
  )
})

test('attachKhqrPayment adds payable payment details only for active invoices', () => {
  const previousEnv = { ...process.env }
  process.env.KHQR_ENABLED = 'true'
  process.env.KHQR_BAKONG_ACCOUNT_ID = 'merchant@bakong'
  process.env.KHQR_MERCHANT_NAME = 'Marvel Decor'
  process.env.KHQR_MERCHANT_CITY = 'PHNOM PENH'
  process.env.KHQR_CURRENCY = 'USD'

  try {
    const invoice = attachKhqrPayment({
      invoiceNumber: 'INV-2026-00002',
      status: 'partially_paid',
      balanceDue: 25,
    })
    assert.equal(invoice.khqrPayment.payable, true)
    assert.equal(invoice.khqrPayment.amount, 25)
    assert.equal(invoice.khqrPayment.reference, 'INV-2026-00002')

    const paidInvoice = attachKhqrPayment({
      invoiceNumber: 'INV-2026-00003',
      status: 'paid',
      balanceDue: 0,
    })
    assert.equal(paidInvoice.khqrPayment.payable, false)
  } finally {
    process.env = previousEnv
  }
})
