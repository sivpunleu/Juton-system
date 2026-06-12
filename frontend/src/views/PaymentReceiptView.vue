<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { insightApi, invoiceApi } from '../api/invoices'
import { canManageBilling } from '../auth/session'
import ContentSkeleton from '../components/ContentSkeleton.vue'
import ErrorState from '../components/ErrorState.vue'
import { formatDate, formatMoney } from '../utils/invoice'
import { showToast } from '../ui/feedback'
import fallbackLogo from '../assets/logo-marvel.png'

const route = useRoute()
const receipt = ref(null)
const loading = ref(true)
const error = ref('')
const sendingTelegram = ref(false)
const telegramConfigured = ref(false)
const printReceipt = () => window.print()

const loadReceipt = async () => {
  loading.value = true
  error.value = ''
  try {
    receipt.value = (
      await invoiceApi.paymentReceipt(
        route.params.id,
        route.params.paymentId,
      )
    ).data
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to load receipt'
  } finally {
    loading.value = false
  }
}

const loadTelegramStatus = async () => {
  try {
    telegramConfigured.value = (
      await insightApi.telegramStatus()
    ).data.configured
  } catch {
    telegramConfigured.value = false
  }
}

const sendTelegram = async () => {
  sendingTelegram.value = true
  try {
    await invoiceApi.sendPaymentTelegram(
      route.params.id,
      route.params.paymentId,
    )
    showToast('ផ្ញើបង្កាន់ដៃទៅ Telegram បានជោគជ័យ')
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message ||
        'មិនអាចផ្ញើបង្កាន់ដៃទៅ Telegram បានទេ',
      'error',
    )
  } finally {
    sendingTelegram.value = false
  }
}

onMounted(() => {
  loadReceipt()
  loadTelegramStatus()
})
</script>

<template>
  <section class="container page-section receipt-page">
    <div class="preview-actions d-print-none">
      <RouterLink
        class="btn btn-outline-secondary"
        :to="`/invoices/${route.params.id}`"
      >
        <i class="bi bi-arrow-left me-1"></i> Invoice
      </RouterLink>
      <button class="btn btn-danger" type="button" @click="printReceipt">
        <i class="bi bi-printer me-1"></i> Print Receipt
      </button>
      <button
        v-if="canManageBilling"
        class="btn btn-outline-info telegram-action"
        type="button"
        :disabled="sendingTelegram || !telegramConfigured"
        :title="
          telegramConfigured
            ? 'ផ្ញើបង្កាន់ដៃទៅ Telegram'
            : 'Telegram Bot មិនទាន់បានកំណត់នៅ Server'
        "
        @click="sendTelegram"
      >
        <span
          v-if="sendingTelegram"
          class="spinner-border spinner-border-sm me-1"
        ></span>
        <i v-else class="bi bi-telegram me-1"></i>
        Telegram
      </button>
    </div>

    <ErrorState
      v-if="error && !receipt"
      :message="error"
      :retrying="loading"
      @retry="loadReceipt"
    />
    <ContentSkeleton v-if="loading" :cards="1" />

    <article v-else-if="receipt" class="receipt-paper">
      <header class="receipt-header">
        <img :src="receipt.settings.logo || fallbackLogo" alt="Company logo" />
        <div>
          <h1>
            {{ receipt.settings.companyNameKh || receipt.settings.companyName }}
          </h1>
          <p>{{ receipt.settings.address }}</p>
          <p>
            Phone: {{ (receipt.settings.phones || []).join(' / ') }}
          </p>
        </div>
      </header>

      <div class="receipt-title">
        <span>បង្កាន់ដៃបង់ប្រាក់</span>
        <strong>PAYMENT RECEIPT</strong>
      </div>

      <div class="receipt-meta">
        <div>
          <span>Receipt No.</span>
          <strong>
            RCPT-{{ String(receipt.payment.id).slice(-8).toUpperCase() }}
          </strong>
        </div>
        <div>
          <span>Payment Date</span>
          <strong>{{ formatDate(receipt.payment.paidAt) }}</strong>
        </div>
        <div>
          <span>Invoice No.</span>
          <strong>{{ receipt.invoice.invoiceNumber }}</strong>
        </div>
        <div>
          <span>Received By</span>
          <strong>{{ receipt.payment.receivedBy }}</strong>
        </div>
        <div>
          <span>Sales Source</span>
          <strong>
            {{
              receipt.invoice.salesChannel === 'salesperson'
                ? receipt.invoice.salesperson?.name || 'Sale'
                : 'In-store'
            }}
          </strong>
        </div>
      </div>

      <section class="receipt-customer">
        <span>Received from</span>
        <h2>{{ receipt.invoice.customer?.name }}</h2>
        <p>
          {{ receipt.invoice.customer?.phone || '-' }} ·
          {{ receipt.invoice.customer?.address || '-' }}
        </p>
      </section>

      <div class="receipt-amount">
        <span>Amount Paid</span>
        <strong>{{ formatMoney(receipt.payment.amount) }}</strong>
      </div>

      <div class="receipt-details">
        <div>
          <span>Note</span>
          <strong>{{ receipt.payment.note || 'Invoice payment' }}</strong>
        </div>
        <div>
          <span>Remaining Balance</span>
          <strong>{{ formatMoney(receipt.balanceAfterPayment) }}</strong>
        </div>
      </div>

      <footer class="receipt-footer">
        <div>
          <span>Customer Signature</span>
        </div>
        <div>
          <span>Authorized Signature</span>
        </div>
      </footer>
      <p class="receipt-thanks">
        {{ receipt.settings.footerEn }} · {{ receipt.settings.footerKh }}
      </p>
    </article>
  </section>
</template>
