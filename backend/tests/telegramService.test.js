import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDebtTelegram,
  buildInvoiceTelegram,
  buildReceiptTelegram,
  sendTelegramMessage,
} from '../services/telegramService.js'

const config = {
  botToken: '123456:test-token',
  chatId: '-100123456',
  publicUrl: 'https://billing.example.com',
  isConfigured: true,
}

const invoice = {
  id: 'invoice-1',
  shareToken: 'public-share-token',
  invoiceNumber: 'INV-2026-00001',
  invoiceDate: '2026-06-10T00:00:00.000Z',
  dueDate: '2999-06-17T00:00:00.000Z',
  customer: { name: 'Sok & Dara', phone: '012345678' },
  items: [
    {
      description: 'Jotun <Paint>',
      quantity: 2,
      unit: 'can',
      unitPrice: 25,
    },
  ],
  grandTotal: 50,
  paidAmount: 10,
  balanceDue: 40,
  status: 'partially_paid',
}

test('invoice and receipt Telegram messages escape HTML and include links', () => {
  const invoiceMessage = buildInvoiceTelegram(
    invoice,
    { companyName: 'Marvel & JOTUN' },
    config,
  )
  assert.match(invoiceMessage.text, /Sok &amp; Dara/)
  assert.match(invoiceMessage.text, /Jotun &lt;Paint&gt;/)
  assert.equal(
    invoiceMessage.replyMarkup.inline_keyboard[0][0].url,
    'https://billing.example.com/public/invoices/public-share-token',
  )

  const receiptMessage = buildReceiptTelegram(
    invoice,
    {
      id: 'payment-12345678',
      amount: 10,
      paidAt: '2026-06-10T00:00:00.000Z',
      receivedBy: 'Owner',
    },
    40,
    { companyName: 'Marvel Decor' },
    config,
  )
  assert.match(receiptMessage.text, /RCPT-12345678/)
  assert.match(receiptMessage.text, /\$10\.00/)
})

test('debt Telegram message reports outstanding and overdue totals', () => {
  const message = buildDebtTelegram(
    [
      invoice,
      {
        ...invoice,
        id: 'invoice-2',
        invoiceNumber: 'INV-2026-00002',
        dueDate: '2020-01-01T00:00:00.000Z',
        balanceDue: 25,
      },
      {
        ...invoice,
        id: 'invoice-3',
        status: 'paid',
        balanceDue: 0,
      },
    ],
    { companyName: 'Marvel Decor' },
    config,
  )
  assert.equal(message.counts.outstanding, 2)
  assert.equal(message.counts.overdue, 1)
  assert.equal(message.totalBalance, 65)
  assert.match(message.text, /\$65\.00/)
})

test('sendTelegramMessage uses the Bot API without exposing token in payload', async () => {
  let request
  const fetchImpl = async (url, options) => {
    request = { url, options }
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true, result: { message_id: 77 } }
      },
    }
  }

  const result = await sendTelegramMessage(
    config,
    { text: '<b>Test</b>' },
    fetchImpl,
  )
  assert.equal(result.message_id, 77)
  assert.match(request.url, /bot123456:test-token\/sendMessage$/)
  const body = JSON.parse(request.options.body)
  assert.equal(body.chat_id, config.chatId)
  assert.equal(body.parse_mode, 'HTML')
  assert.equal(body.text, '<b>Test</b>')
  assert.equal(body.text.includes(config.botToken), false)
})

test('sendTelegramMessage rejects missing configuration', async () => {
  await assert.rejects(
    sendTelegramMessage(
      { botToken: '', chatId: '', isConfigured: false },
      { text: 'Test' },
      async () => {
        throw new Error('fetch should not run')
      },
    ),
    /not configured/,
  )
})
