<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { insightApi, invoiceApi, settingsApi } from '../api/invoices'
import {
  canManageBilling,
  currentAdmin,
  isAuthenticated,
} from '../auth/session'
import ContentSkeleton from '../components/ContentSkeleton.vue'
import { formatDate, formatMoney, toDateInput } from '../utils/invoice'
import {
  requestConfirmation,
  showToast,
  validateForm,
} from '../ui/feedback'
import logo from '../assets/logo-marvel.png'
import jotunLogo from '../assets/jotun.jpg'
import qrPlaceholder from '../assets/aba-qr-square.jpg'

const route = useRoute()
const router = useRouter()
const invoice = ref(null)
const loading = ref(true)
const error = ref('')
const recordingPayment = ref(false)
const sendingTelegram = ref('')
const telegramConfigured = ref(false)
const paymentForm = reactive({
  amount: 0,
  paidAt: toDateInput(),
  receivedBy:
    currentAdmin.value?.displayName || currentAdmin.value?.username || '',
  note: '',
})
const companySettings = reactive({
  companyName: 'Marvel Decor & JOTUN',
  companyNameKh: 'ម៉ាវែល ដេគ័រ & JOTUN',
  address: '',
  telegram: '068 8888 70',
  phones: ['098 689 883', '068 888 870'],
  paymentAccount: 'ABA : 068 888 187',
  invoiceNotes: '',
  footerKh: 'សូមអរគុណចំពោះការគាំទ្រ !',
  footerEn: 'Thank you for support !',
  logo: '',
  jotunLogo: '',
  paymentQr: '',
  sellerSignature: '',
})

const printInvoice = () => window.print()

const formatInvoiceDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  const day = String(date.getDate()).padStart(2, '0')
  const month = date.toLocaleString('en-US', { month: 'short' })
  return `${day}-${month}-${date.getFullYear()}`
}

const money = (value) => formatMoney(value).replace('$', '').trim()

const totalBeforeDeposit = (data) =>
  Number(data.grandTotal ?? data.subtotal ?? 0)

const depositAmount = (data) =>
  Number(
    data.depositAmount ??
      totalBeforeDeposit(data) * (Number(data.depositRate || 0) / 100),
  )

const balanceDue = (data) =>
  Number(data.balanceDue ?? totalBeforeDeposit(data) - depositAmount(data))

const paidAmount = (data) =>
  Math.max(
    Number(data.paidAmount || 0),
    Math.max(0, totalBeforeDeposit(data) - balanceDue(data)),
  )

const resolvedStatus = computed(() => {
  if (!invoice.value) return 'unpaid'
  if (invoice.value.status) return invoice.value.status
  return invoice.value.paymentStatus === 'partial'
    ? 'partially_paid'
    : invoice.value.paymentStatus || 'unpaid'
})

const statusLabels = {
  draft: 'Draft',
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

const isPublicPreview = computed(
  () => route.name === 'public-invoice-preview',
)
const showAdminControls = computed(
  () => !isPublicPreview.value && isAuthenticated.value,
)
const showManageControls = computed(
  () => showAdminControls.value && canManageBilling.value,
)

const loadInvoice = async () => {
  try {
    const response = isPublicPreview.value
      ? await invoiceApi.getPublic(route.params.token)
      : await invoiceApi.get(route.params.id)
    invoice.value = response.data
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចទាញយកវិក្កយបត្របានទេ'
  } finally {
    loading.value = false
  }
}

const deleteInvoice = async () => {
  const confirmed = await requestConfirmation({
    title: 'លុបវិក្កយបត្រ?',
    message: `វិក្កយបត្រ ${invoice.value.invoiceNumber} នឹងត្រូវផ្លាស់ទីទៅធុងសំរាម។`,
    confirmLabel: 'លុប',
    cancelLabel: 'បោះបង់',
    tone: 'danger',
  })
  if (!confirmed) return

  try {
    await invoiceApi.remove(invoice.value.id)
    showToast('វិក្កយបត្រត្រូវបានផ្លាស់ទីទៅធុងសំរាម')
    router.push('/invoices')
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចលុបវិក្កយបត្របានទេ'
    showToast(error.value, 'error')
  }
}

const loadSettings = async () => {
  try {
    Object.assign(companySettings, (await settingsApi.get()).data)
  } catch {
    // Keep local fallback branding if settings cannot be loaded.
  }
}

const loadTelegramStatus = async () => {
  if (!showAdminControls.value) return
  try {
    telegramConfigured.value = (
      await insightApi.telegramStatus()
    ).data.configured
  } catch {
    telegramConfigured.value = false
  }
}

const sendInvoiceTelegram = async () => {
  sendingTelegram.value = 'invoice'
  try {
    await invoiceApi.sendTelegram(invoice.value.id)
    showToast('ផ្ញើវិក្កយបត្រទៅ Telegram បានជោគជ័យ')
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message ||
        'មិនអាចផ្ញើវិក្កយបត្រទៅ Telegram បានទេ',
      'error',
    )
  } finally {
    sendingTelegram.value = ''
  }
}

const sendReceiptTelegram = async (payment) => {
  sendingTelegram.value = String(payment.id)
  try {
    await invoiceApi.sendPaymentTelegram(invoice.value.id, payment.id)
    showToast('ផ្ញើបង្កាន់ដៃទៅ Telegram បានជោគជ័យ')
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message ||
        'មិនអាចផ្ញើបង្កាន់ដៃទៅ Telegram បានទេ',
      'error',
    )
  } finally {
    sendingTelegram.value = ''
  }
}

const addPayment = async (event) => {
  if (!(await validateForm(event?.currentTarget))) return

  recordingPayment.value = true
  error.value = ''
  try {
    const response = await invoiceApi.addPayment(invoice.value.id, paymentForm)
    invoice.value = response.data
    showToast('កត់ត្រាការបង់ប្រាក់បានជោគជ័យ')
    Object.assign(paymentForm, {
      amount: 0,
      paidAt: toDateInput(),
      receivedBy:
        currentAdmin.value?.displayName || currentAdmin.value?.username || '',
      note: '',
    })
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចកត់ត្រាការបង់ប្រាក់បានទេ'
    showToast(error.value, 'error')
  } finally {
    recordingPayment.value = false
  }
}

onMounted(() => {
  loadInvoice()
  loadSettings()
  loadTelegramStatus()
})
</script>

<template>
  <section class="container page-section preview-page">
    <div class="preview-actions d-print-none">
      <RouterLink
        v-if="showAdminControls"
        class="btn btn-outline-secondary"
        to="/invoices"
      >
        <i class="bi bi-arrow-left me-1"></i>
        បញ្ជីវិក្កយបត្រ
      </RouterLink>
      <span v-else></span>
      <div class="d-flex flex-wrap gap-2">
        <RouterLink
          v-if="invoice && showManageControls"
          class="btn btn-outline-primary"
          :to="{ name: 'invoice-edit', params: { id: invoice.id } }"
        >
          <i class="bi bi-pencil me-1"></i>
          កែប្រែ
        </RouterLink>
        <RouterLink
          v-if="invoice && showManageControls"
          class="btn btn-outline-secondary"
          :to="{
            name: 'invoice-create',
            query: { duplicate: invoice.id },
          }"
        >
          <i class="bi bi-copy me-1"></i>
          ចម្លងវិក្កយបត្រ
        </RouterLink>
        <button
          v-if="invoice && showManageControls"
          class="btn btn-outline-info telegram-action"
          type="button"
          :disabled="Boolean(sendingTelegram) || !telegramConfigured"
          :title="
            telegramConfigured
              ? 'ផ្ញើវិក្កយបត្រទៅ Telegram'
              : 'Telegram Bot មិនទាន់បានកំណត់នៅ Server'
          "
          @click="sendInvoiceTelegram"
        >
          <span
            v-if="sendingTelegram === 'invoice'"
            class="spinner-border spinner-border-sm me-1"
          ></span>
          <i v-else class="bi bi-telegram me-1"></i>
          Telegram
        </button>
        <button
          v-if="invoice && showManageControls"
          class="btn btn-outline-danger"
          type="button"
          @click="deleteInvoice"
        >
          <i class="bi bi-trash3 me-1"></i>
          លុប
        </button>
        <button
          v-if="invoice"
          class="btn btn-danger"
          type="button"
          @click="printInvoice"
        >
          <i class="bi bi-printer me-1"></i>
          Print / Save PDF
        </button>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <ContentSkeleton v-if="loading" :cards="2" />

    <div
      v-if="invoice && showAdminControls"
      class="payment-management d-print-none"
    >
      <div class="content-card form-card">
        <div class="payment-management-heading">
          <div>
            <span
              class="status-pill"
              :class="`status-${resolvedStatus}`"
            >
              {{ statusLabels[resolvedStatus] }}
            </span>
            <h2>Payment History</h2>
            <p>
              បានបង់ {{ formatMoney(paidAmount(invoice)) }} · នៅសល់
              {{ formatMoney(invoice.balanceDue) }}
            </p>
          </div>
        </div>

        <form
          v-if="
            showManageControls &&
            !['draft', 'cancelled', 'paid'].includes(resolvedStatus)
          "
          class="row g-3 payment-form"
          novalidate
          @submit.prevent="addPayment"
        >
          <div class="col-md-3">
            <label class="form-label">ចំនួនប្រាក់ *</label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <input
                v-model.number="paymentForm.amount"
                class="form-control"
                type="number"
                min="0.01"
                :max="invoice.balanceDue"
                step="0.01"
                required
              />
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label">ថ្ងៃបង់ *</label>
            <input
              v-model="paymentForm.paidAt"
              class="form-control"
              type="date"
              required
            />
          </div>
          <div class="col-md-3">
            <label class="form-label">អ្នកទទួល *</label>
            <input
              v-model.trim="paymentForm.receivedBy"
              class="form-control"
              required
            />
          </div>
          <div class="col-md-3">
            <label class="form-label">កំណត់ចំណាំ</label>
            <input v-model.trim="paymentForm.note" class="form-control" />
          </div>
          <div class="col-12">
            <button
              class="btn btn-success"
              type="submit"
              :disabled="recordingPayment"
            >
              <i class="bi bi-cash-coin me-1"></i>
              {{ recordingPayment ? 'កំពុងកត់ត្រា...' : 'កត់ត្រាការបង់ប្រាក់' }}
            </button>
          </div>
        </form>

        <div v-if="invoice.payments?.length" class="table-responsive mt-4">
          <table class="table table-sm payment-table responsive-table mb-0">
            <thead>
              <tr>
                <th>ថ្ងៃបង់</th>
                <th>អ្នកទទួល</th>
                <th>កំណត់ចំណាំ</th>
                <th class="text-end">ចំនួន</th>
                <th class="text-end">Receipt</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="payment in invoice.payments" :key="payment.id">
                <td class="mobile-card-primary" data-label="ថ្ងៃបង់">{{ formatDate(payment.paidAt) }}</td>
                <td data-label="អ្នកទទួល">{{ payment.receivedBy }}</td>
                <td data-label="កំណត់ចំណាំ">{{ payment.note || '-' }}</td>
                <td class="text-end fw-bold" data-label="ចំនួន">{{ formatMoney(payment.amount) }}</td>
                <td class="text-end" data-label="Receipt">
                  <div class="d-inline-flex gap-1">
                    <RouterLink
                      class="btn btn-sm btn-outline-primary"
                      :to="{
                        name: 'payment-receipt',
                        params: {
                          id: invoice.id,
                          paymentId: payment.id,
                        },
                      }"
                    >
                      <i class="bi bi-printer"></i>
                    </RouterLink>
                    <button
                      v-if="showManageControls"
                      class="btn btn-sm btn-outline-info telegram-action"
                      type="button"
                      :disabled="
                        Boolean(sendingTelegram) || !telegramConfigured
                      "
                      title="ផ្ញើបង្កាន់ដៃទៅ Telegram"
                      @click="sendReceiptTelegram(payment)"
                    >
                      <span
                        v-if="sendingTelegram === String(payment.id)"
                        class="spinner-border spinner-border-sm"
                      ></span>
                      <i v-else class="bi bi-telegram"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-secondary mb-0 mt-3">
          មិនទាន់មានការបង់ប្រាក់បន្ថែម។
        </p>
      </div>
    </div>

    <article v-if="invoice" class="invoice-paper classic-invoice">
      <header class="classic-header">
        <div class="classic-brand-block">
          <img class="classic-logo" :src="companySettings.logo || logo" alt="Marvel Decor" />
          <div class="classic-brand-copy">
            <h5 class="classic-brand-title">ម៉ាវែល ដេគ័រ</h5>
            <h6 class="classic-subtitle">Marvel Decor</h6>
          </div>
        </div>
        <div class="company-copy">
          <h1>{{ companySettings.companyNameKh || companySettings.companyName }}</h1>
          <p v-if="companySettings.companyName">
            {{ companySettings.companyName }}
          </p>
          <p v-if="companySettings.address">
            អាស័យដ្ឋាន : {{ companySettings.address }}
          </p>
          <p v-if="companySettings.telegram">
            Telegram : {{ companySettings.telegram }}
          </p>
          <p v-for="phone in companySettings.phones" :key="phone">
            លេខទូរស័ព្ទ | Phone: {{ phone }}
          </p>
        </div>
        <div class="classic-jotun-block">
          <img
            class="classic-jotun-logo"
            :src="companySettings.jotunLogo || jotunLogo"
            alt="Jotun"
            style="width: 150px; height: 50px"
          />
        </div>
      </header>

      <div class="invoice-heading">
        <h2>វិក្កយបត្រ / INVOICE</h2>
      </div>

      <section class="classic-customer">
        <div class="customer-details">
          <div class="invoice-info-row">
            <strong>អតិថិជន | Customer:</strong>
            <span>{{ invoice.customer.name }}</span>
          </div>
          <div class="invoice-info-row">
            <strong>លេខទូរស័ព្ទ | Phone:</strong>
            <span>{{ invoice.customer.phone || '-' }}</span>
          </div>
          <div class="invoice-info-row">
            <strong>អាសយដ្ឋាន | Address:</strong>
            <span>{{ invoice.customer.address || '-' }}</span>
          </div>
        </div>
        <div class="classic-meta">
          <div class="invoice-info-row">
            <strong>កាលបរិច្ឆេទ | Date:</strong>
            <span>{{ formatInvoiceDate(invoice.invoiceDate) }}</span>
          </div>
          <div class="invoice-info-row">
            <strong>វិក្កយបត្រ | Invoice No:</strong>
            <span>{{ invoice.invoiceNumber }}</span>
          </div>
          <div class="invoice-info-row">
            <strong>ប្រភពលក់ | Sold By:</strong>
            <span>
              {{
                invoice.salesChannel === 'salesperson'
                  ? invoice.salesperson?.name || '-'
                  : 'ទិញនៅហាងផ្ទាល់'
              }}
            </span>
          </div>
        </div>
      </section>

      <table class="classic-table">
        <thead>
          <tr>
            <th class="number-column">ល.រ<br />No.</th>
            <th>ឈ្មោះ និងបរិយាយទំនិញ<br />Item &amp; Description</th>
            <th class="code-column">លេខកូដពណ៌<br />Color Code</th>
            <th class="qty-column">ចំនួន<br />Qty</th>
            <th class="money-column">តម្លៃ<br />Unit Price</th>
            <th class="money-column">សរុប<br />Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in invoice.items" :key="item.id || index">
            <td class="text-center">{{ index + 1 }}</td>
            <td>{{ item.description }}</td>
            <td class="text-center">{{ item.colorCode || '-' }}</td>
            <td class="text-center qty-value">
              {{ item.quantity }}
              <span v-if="item.unit">{{ item.unit }}</span>
            </td>
            <td class="currency-cell">
              <span>$</span>
              <strong>{{ money(item.unitPrice) }}</strong>
            </td>
            <td class="currency-cell">
              <span>$</span>
              <strong>{{ money(item.total) }}</strong>
            </td>
          </tr>
          <tr
            v-for="index in Math.max(0, 5 - invoice.items.length)"
            :key="`blank-${index}`"
            class="blank-item-row"
          >
            <td>&nbsp;</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <section class="classic-settlement">
        <div class="classic-payment">
          <div class="payment-notes">
            <p v-if="invoice.notes">{{ invoice.notes }}</p>
            <template v-else-if="companySettings.invoiceNotes">
              <p>{{ companySettings.invoiceNotes }}</p>
            </template>
            <template v-else>
              <p>- ទំនិញទិញហើយមិនអាចប្តូរ ឬសងត្រឡប់វិញបានទេ</p>
              <p>- រាល់ការទូទាត់ត្រូវមានវិក្កយបត្រត្រឹមត្រូវ</p>
            </template>
          </div>
          <div class="qr-block">
            <p>ទូទាត់តាមរយៈ៖</p>
            <strong>{{ companySettings.paymentAccount }}</strong>
            <img :src="companySettings.paymentQr || qrPlaceholder" alt="ABA payment QR" />
            <!-- <small>REN THEA R. &amp; KHIM C.</small> -->
          </div>
        </div>

        <table class="classic-totals">
          <tbody>
            <tr>
              <th>សរុប<br /><span>Total Price</span></th>
              <td><span>$</span><strong>{{ money(invoice.subtotal) }}</strong></td>
            </tr>
            <tr v-if="Number(invoice.discount || 0) > 0">
              <th>បញ្ចុះតម្លៃ<br /><span>Discount</span></th>
              <td><span>$</span><strong>-{{ money(invoice.discount) }}</strong></td>
            </tr>
            <tr v-if="Number(invoice.taxAmount || 0) > 0">
              <th>ពន្ធ ({{ invoice.taxRate }}%)<br /><span>Tax</span></th>
              <td><span>$</span><strong>{{ money(invoice.taxAmount) }}</strong></td>
            </tr>
            <tr>
              <th>ថ្លៃដឹកជញ្ជូន<br /><span>Delivery Fee</span></th>
              <td><span>$</span><strong>{{ money(invoice.deliveryFee) }}</strong></td>
            </tr>
            <tr>
              <th>
                ប្រាក់កក់ ({{ invoice.depositRate || 0 }}%)<br />
                <span>Deposit ({{ invoice.depositRate || 0 }}%)</span>
              </th>
              <td><span>$</span><strong>{{ money(depositAmount(invoice)) }}</strong></td>
            </tr>
            <tr>
              <th>ប្រាក់នៅសល់<br /><span>Balance Due</span></th>
              <td><span>$</span><strong>{{ money(balanceDue(invoice)) }}</strong></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="signature-section">
        <div class="signature-box">
          <div class="signature-space"></div>
          <div class="signature-line"></div>
          <p>ហត្ថលេខា និងឈ្មោះ អតិថិជន</p>
          <span>Customer's Signature &amp; Name</span>
        </div>
        <div class="signature-box">
          <div class="signature-space seller-mark">
            <img
              v-if="companySettings.sellerSignature"
              class="seller-signature-image"
              :src="companySettings.sellerSignature"
              alt="Seller signature"
            />
          </div>
          <div class="signature-line"></div>
          <p>ហត្ថលេខា និងឈ្មោះ អ្នកលក់</p>
          <span>Seller's Signature &amp; Name</span>
        </div>
      </section>

      <footer class="classic-footer">
        <span>{{ companySettings.footerEn }}</span>
        <strong>{{ companySettings.footerKh }}</strong>
      </footer>
    </article>
  </section>
</template>
