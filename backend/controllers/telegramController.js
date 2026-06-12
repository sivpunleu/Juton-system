import { getTelegramConfig } from '../config/telegram.js'
import { writeAuditLog } from '../repositories/auditRepository.js'
import { getAllInvoices, findInvoiceById } from '../repositories/invoiceRepository.js'
import { getSystemSettings } from '../repositories/settingsRepository.js'
import {
  buildDebtTelegram,
  buildInvoiceTelegram,
  buildReceiptTelegram,
  sendTelegramMessage,
} from '../services/telegramService.js'

const sendError = (res, error) =>
  res.status(error.statusCode || 400).json({
    message: error.message || 'Unable to send Telegram message',
  })

const receiptDetails = (invoice, paymentId) => {
  const payments = invoice.payments || []
  const paymentIndex = payments.findIndex(
    (item) => String(item.id) === String(paymentId),
  )
  const payment = payments[paymentIndex]
  if (!payment) return null
  const paidThroughReceipt =
    Number(invoice.depositAmount || 0) +
    payments
      .slice(0, paymentIndex + 1)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
  return {
    payment,
    balanceAfterPayment: Math.max(
      0,
      Number(invoice.grandTotal || 0) - paidThroughReceipt,
    ),
  }
}

export const getTelegramStatus = async (_req, res) => {
  const config = getTelegramConfig()
  res.json({ configured: config.isConfigured })
}

export const sendInvoiceToTelegram = async (req, res) => {
  try {
    const invoice = await findInvoiceById(req.params.id)
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' })
    const config = getTelegramConfig()
    const message = buildInvoiceTelegram(
      invoice,
      await getSystemSettings(),
      config,
    )
    const result = await sendTelegramMessage(config, message)
    await writeAuditLog({
      actor: req.admin,
      action: 'telegram_invoice',
      entityType: 'invoice',
      entityId: invoice.id,
      summary: invoice.invoiceNumber,
      details: { telegramMessageId: result.message_id },
    })
    res.json({ message: 'Invoice sent to Telegram', messageId: result.message_id })
  } catch (error) {
    sendError(res, error)
  }
}

export const sendReceiptToTelegram = async (req, res) => {
  try {
    const invoice = await findInvoiceById(req.params.id)
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' })
    const receipt = receiptDetails(invoice, req.params.paymentId)
    if (!receipt) return res.status(404).json({ message: 'Payment not found' })
    const config = getTelegramConfig()
    const message = buildReceiptTelegram(
      invoice,
      receipt.payment,
      receipt.balanceAfterPayment,
      await getSystemSettings(),
      config,
    )
    const result = await sendTelegramMessage(config, message)
    await writeAuditLog({
      actor: req.admin,
      action: 'telegram_receipt',
      entityType: 'invoice',
      entityId: invoice.id,
      summary: `${invoice.invoiceNumber}: $${Number(
        receipt.payment.amount || 0,
      ).toFixed(2)}`,
      details: {
        paymentId: String(receipt.payment.id),
        telegramMessageId: result.message_id,
      },
    })
    res.json({ message: 'Receipt sent to Telegram', messageId: result.message_id })
  } catch (error) {
    sendError(res, error)
  }
}

export const sendDebtAlertToTelegram = async (req, res) => {
  try {
    const config = getTelegramConfig()
    const message = buildDebtTelegram(
      await getAllInvoices(),
      await getSystemSettings(),
      config,
    )
    const result = await sendTelegramMessage(config, message)
    await writeAuditLog({
      actor: req.admin,
      action: 'telegram_debt_alert',
      entityType: 'invoice',
      summary: `${message.counts.outstanding} outstanding / ${message.counts.overdue} overdue`,
      details: {
        ...message.counts,
        totalBalance: message.totalBalance,
        telegramMessageId: result.message_id,
      },
    })
    res.json({
      message: 'Debt alert sent to Telegram',
      messageId: result.message_id,
      counts: message.counts,
    })
  } catch (error) {
    sendError(res, error)
  }
}
