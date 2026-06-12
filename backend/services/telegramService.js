const TELEGRAM_API_URL = 'https://api.telegram.org'

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const money = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(value || 0))

const date = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

const invoiceUrl = (config, invoice) => {
  const publicUrl = String(config.publicUrl || '').replace(/\/+$/, '')
  const token = String(invoice?.shareToken || '').trim()
  return publicUrl && token
    ? `${publicUrl}/public/invoices/${encodeURIComponent(token)}`
    : ''
}

const invoiceKeyboard = (config, invoice) => {
  const url = invoiceUrl(config, invoice)
  return url
    ? {
        inline_keyboard: [
          [{ text: 'Open Invoice', url }],
        ],
      }
    : undefined
}

const statusLabel = (invoice) => {
  if (invoice.status) return invoice.status.replaceAll('_', ' ')
  if (invoice.paymentStatus === 'partial') return 'partially paid'
  return invoice.paymentStatus || 'unpaid'
}

export const buildInvoiceTelegram = (invoice, settings, config) => {
  const itemLines = (invoice.items || []).slice(0, 20).map((item, index) => {
    const description = String(item.description || '').slice(0, 80)
    return `${index + 1}. ${escapeHtml(description)} — ${escapeHtml(
      `${item.quantity || 0} ${item.unit || ''}`,
    )} × ${escapeHtml(money(item.unitPrice))}`
  })
  if ((invoice.items || []).length > 20) {
    itemLines.push(`… +${invoice.items.length - 20} more items`)
  }

  const company = settings.companyNameKh || settings.companyName || 'Billing'
  const text = [
    `<b>🧾 INVOICE ${escapeHtml(invoice.invoiceNumber)}</b>`,
    `<b>${escapeHtml(company)}</b>`,
    '',
    `<b>Customer:</b> ${escapeHtml(invoice.customer?.name || '-')}`,
    `<b>Phone:</b> ${escapeHtml(invoice.customer?.phone || '-')}`,
    `<b>Date:</b> ${escapeHtml(date(invoice.invoiceDate))}`,
    `<b>Due:</b> ${escapeHtml(date(invoice.dueDate))}`,
    `<b>Status:</b> ${escapeHtml(statusLabel(invoice))}`,
    '',
    '<b>Items</b>',
    ...itemLines,
    '',
    `<b>Total:</b> ${escapeHtml(money(invoice.grandTotal))}`,
    `<b>Paid:</b> ${escapeHtml(money(invoice.paidAmount))}`,
    `<b>Balance:</b> ${escapeHtml(money(invoice.balanceDue))}`,
  ].join('\n')

  return {
    text,
    replyMarkup: invoiceKeyboard(config, invoice),
  }
}

export const buildReceiptTelegram = (
  invoice,
  payment,
  balanceAfterPayment,
  settings,
  config,
) => {
  const company = settings.companyNameKh || settings.companyName || 'Billing'
  const receiptNumber = `RCPT-${String(payment.id).slice(-8).toUpperCase()}`
  const text = [
    `<b>✅ PAYMENT RECEIPT ${escapeHtml(receiptNumber)}</b>`,
    `<b>${escapeHtml(company)}</b>`,
    '',
    `<b>Invoice:</b> ${escapeHtml(invoice.invoiceNumber)}`,
    `<b>Customer:</b> ${escapeHtml(invoice.customer?.name || '-')}`,
    `<b>Payment Date:</b> ${escapeHtml(date(payment.paidAt))}`,
    `<b>Amount Paid:</b> ${escapeHtml(money(payment.amount))}`,
    `<b>Received By:</b> ${escapeHtml(payment.receivedBy || '-')}`,
    `<b>Note:</b> ${escapeHtml(payment.note || 'Invoice payment')}`,
    `<b>Remaining Balance:</b> ${escapeHtml(money(balanceAfterPayment))}`,
  ].join('\n')

  return {
    text,
    replyMarkup: invoiceKeyboard(config, invoice),
  }
}

export const buildDebtTelegram = (invoices, settings, config) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const active = invoices
    .filter((invoice) => !invoice.deletedAt)
    .filter(
      (invoice) =>
        !['draft', 'cancelled', 'paid'].includes(invoice.status) &&
        Number(invoice.balanceDue || 0) > 0,
    )
    .sort((left, right) => Number(right.balanceDue) - Number(left.balanceDue))
  const overdue = active.filter((invoice) => new Date(invoice.dueDate) < today)
  const totalBalance = active.reduce(
    (sum, invoice) => sum + Number(invoice.balanceDue || 0),
    0,
  )
  const lines = active.slice(0, 20).map(
    (invoice, index) =>
      `${index + 1}. <b>${escapeHtml(invoice.invoiceNumber)}</b> — ${escapeHtml(
        invoice.customer?.name || '-',
      )} — ${escapeHtml(money(invoice.balanceDue))}${
        new Date(invoice.dueDate) < today ? ' ⚠️ overdue' : ''
      }`,
  )
  if (active.length > 20) lines.push(`… +${active.length - 20} more invoices`)

  const company = settings.companyNameKh || settings.companyName || 'Billing'
  const text = [
    `<b>🔔 DEBT ALERT — ${escapeHtml(company)}</b>`,
    '',
    `<b>Outstanding invoices:</b> ${active.length}`,
    `<b>Overdue invoices:</b> ${overdue.length}`,
    `<b>Total balance:</b> ${escapeHtml(money(totalBalance))}`,
    '',
    ...(lines.length ? lines : ['✅ No outstanding debt.']),
  ].join('\n')
  const reportsUrl = config.publicUrl ? `${config.publicUrl}/reports` : ''

  return {
    text,
    replyMarkup: reportsUrl
      ? {
          inline_keyboard: [
            [{ text: 'Open Reports', url: reportsUrl }],
          ],
        }
      : undefined,
    counts: {
      outstanding: active.length,
      overdue: overdue.length,
    },
    totalBalance,
  }
}

export const sendTelegramMessage = async (
  config,
  { text, replyMarkup },
  fetchImpl = globalThis.fetch,
) => {
  if (!config.isConfigured) {
    const error = new Error('Telegram Bot is not configured')
    error.statusCode = 503
    throw error
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch is not available on this server')
  }

  let response
  try {
    response = await fetchImpl(
      `${TELEGRAM_API_URL}/bot${config.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
      },
    )
  } catch (requestError) {
    const error = new Error(
      requestError.message || 'Unable to reach Telegram',
    )
    error.statusCode = 502
    throw error
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.ok) {
    const error = new Error(
      payload.description || `Telegram request failed (${response.status})`,
    )
    error.statusCode = response.status >= 400 ? 502 : 500
    throw error
  }
  return payload.result
}
