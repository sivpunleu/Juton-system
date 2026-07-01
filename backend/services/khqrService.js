const KHQR_GUI = 'kh.gov.nbc.bakong'
const DEFAULT_MCC = '5999'
const COUNTRY_CODE = 'KH'
const SUPPORTED_CURRENCIES = {
  KHR: '116',
  USD: '840',
}

const cleanText = (value, fallback = '') =>
  String(value || fallback)
    .trim()
    .replace(/\s+/g, ' ')

const truncate = (value, maxLength) => cleanText(value).slice(0, maxLength)

const tag = (id, value) => {
  const text = String(value ?? '')
  if (!text) return ''
  const length = String(text.length).padStart(2, '0')
  if (length.length > 2) {
    throw new Error(`KHQR field ${id} is too long`)
  }
  return `${id}${length}${text}`
}

export const crc16Ccitt = (value) => {
  let crc = 0xffff
  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        crc & 0x8000
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

const khqrConfig = () => {
  const accountId = cleanText(process.env.KHQR_BAKONG_ACCOUNT_ID)
  const merchantName = truncate(
    process.env.KHQR_MERCHANT_NAME || process.env.KHQR_ACCOUNT_NAME,
    25,
  )
  return {
    enabled: process.env.KHQR_ENABLED === 'true',
    accountId,
    merchantName,
    merchantCity: truncate(process.env.KHQR_MERCHANT_CITY || 'PHNOM PENH', 15),
    merchantCategoryCode: truncate(
      process.env.KHQR_MERCHANT_CATEGORY_CODE || DEFAULT_MCC,
      4,
    ).padStart(4, '0'),
    currency:
      SUPPORTED_CURRENCIES[
        cleanText(process.env.KHQR_CURRENCY || 'USD').toUpperCase()
      ] || SUPPORTED_CURRENCIES.USD,
  }
}

export const isKhqrConfigured = () => {
  const config = khqrConfig()
  return Boolean(config.enabled && config.accountId && config.merchantName)
}

export const generateKhqrPayload = ({
  amount,
  invoiceNumber,
  merchantName,
  merchantCity,
  accountId,
  currency,
  merchantCategoryCode,
}) => {
  const roundedAmount = Math.round((Number(amount) + Number.EPSILON) * 100) / 100
  if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
    throw new Error('KHQR amount must be greater than zero')
  }

  const accountInfo = [
    tag('00', KHQR_GUI),
    tag('01', truncate(accountId, 32)),
  ].join('')
  const additionalData = tag('01', truncate(invoiceNumber, 25))
  const payloadWithoutCrc = [
    tag('00', '01'),
    tag('01', '12'),
    tag('29', accountInfo),
    tag('52', merchantCategoryCode || DEFAULT_MCC),
    tag('53', currency || SUPPORTED_CURRENCIES.USD),
    tag('54', roundedAmount.toFixed(2)),
    tag('58', COUNTRY_CODE),
    tag('59', truncate(merchantName, 25).toUpperCase()),
    tag('60', truncate(merchantCity || 'PHNOM PENH', 15).toUpperCase()),
    tag('62', additionalData),
    '6304',
  ].join('')

  return `${payloadWithoutCrc}${crc16Ccitt(payloadWithoutCrc)}`
}

const plainInvoice = (invoice) =>
  typeof invoice?.get === 'function' ? invoice.get({ plain: true }) : invoice

export const buildInvoiceKhqrPayment = (invoice) => {
  const data = plainInvoice(invoice)
  const config = khqrConfig()
  const amount = Math.round(
    (Number(data?.balanceDue || 0) + Number.EPSILON) * 100,
  ) / 100

  if (!config.enabled) {
    return { enabled: false, configured: false }
  }
  if (!config.accountId || !config.merchantName) {
    return { enabled: true, configured: false }
  }
  if (!data || ['draft', 'cancelled', 'paid'].includes(data.status) || amount <= 0) {
    return { enabled: true, configured: true, payable: false }
  }

  return {
    enabled: true,
    configured: true,
    payable: true,
    provider: 'Bakong KHQR',
    payload: generateKhqrPayload({
      amount,
      invoiceNumber: data.invoiceNumber,
      ...config,
    }),
    amount,
    currency: Object.entries(SUPPORTED_CURRENCIES).find(
      ([, code]) => code === config.currency,
    )?.[0],
    reference: data.invoiceNumber,
    merchantName: config.merchantName,
    accountId: config.accountId,
  }
}

export const attachKhqrPayment = (invoice) => {
  const data = plainInvoice(invoice)
  if (!data) return data
  return {
    ...data,
    khqrPayment: buildInvoiceKhqrPayment(data),
  }
}
