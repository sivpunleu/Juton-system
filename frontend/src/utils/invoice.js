export const formatMoney = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(value || 0))

export const formatDate = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export const toDateInput = (value) => {
  const date = value ? new Date(value) : new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60 * 1000)
    .toISOString()
    .slice(0, 10)
}

export const resolveInvoiceStatus = (invoice = {}) => {
  if (invoice.status) return invoice.status
  if (invoice.paymentStatus === 'partial') return 'partially_paid'
  return invoice.paymentStatus || 'unpaid'
}

export const invoiceStatusLabels = {
  draft: 'Draft',
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
}
