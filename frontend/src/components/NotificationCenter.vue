<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { insightApi } from '../api/invoices'
import { canManageBilling } from '../auth/session'
import { showToast } from '../ui/feedback'
import { formatDate, formatMoney } from '../utils/invoice'

const router = useRouter()
const open = ref(false)
const loading = ref(false)
const data = ref({
  counts: { overdue: 0, outstanding: 0, lowStock: 0 },
  overdue: [],
  outstanding: [],
  lowStock: [],
  activity: [],
})
const activeTab = ref('alerts')
const telegramConfigured = ref(false)
const sendingDebt = ref(false)

const alertCount = computed(
  () => data.value.counts.overdue + data.value.counts.lowStock,
)

const load = async () => {
  loading.value = true
  try {
    data.value = (await insightApi.notifications()).data
  } catch {
    data.value = {
      counts: { overdue: 0, outstanding: 0, lowStock: 0 },
      overdue: [],
      outstanding: [],
      lowStock: [],
      activity: [],
    }
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

const sendDebtTelegram = async () => {
  sendingDebt.value = true
  try {
    const { data: response } = await insightApi.sendDebtTelegram()
    showToast(
      `ផ្ញើ Debt Alert បានជោគជ័យ (${response.counts.outstanding} invoices)`,
    )
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message ||
        'មិនអាចផ្ញើ Debt Alert ទៅ Telegram បានទេ',
      'error',
    )
  } finally {
    sendingDebt.value = false
  }
}

const toggle = () => {
  open.value = !open.value
  if (open.value) load()
}

const navigate = async (target) => {
  open.value = false
  await router.push(target)
}

let refreshTimer
onMounted(() => {
  load()
  loadTelegramStatus()
  refreshTimer = window.setInterval(load, 120000)
})
onBeforeUnmount(() => clearInterval(refreshTimer))
</script>

<template>
  <div class="notification-center">
    <button
      class="notification-trigger"
      type="button"
      aria-label="Notifications"
      @click="toggle"
    >
      <i class="bi bi-bell"></i>
      <span v-if="alertCount">{{ Math.min(alertCount, 99) }}</span>
    </button>

    <button
      v-if="open"
      class="notification-dismiss"
      type="button"
      aria-label="Close notifications"
      @click="open = false"
    ></button>

    <section v-if="open" class="notification-panel">
      <header>
        <div>
          <small>NOTIFICATION CENTER</small>
          <h2>ការជូនដំណឹង</h2>
        </div>
        <button type="button" @click="load">
          <i class="bi bi-arrow-clockwise" :class="{ spinning: loading }"></i>
        </button>
      </header>

      <div class="notification-tabs">
        <button
          type="button"
          :class="{ active: activeTab === 'alerts' }"
          @click="activeTab = 'alerts'"
        >
          Alerts
          <span>{{ alertCount }}</span>
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'activity' }"
          @click="activeTab = 'activity'"
        >
          Activity
        </button>
      </div>

      <div v-if="activeTab === 'alerts'" class="notification-list">
        <div v-if="data.overdue.length" class="notification-section-label">
          ហួសថ្ងៃកំណត់
        </div>
        <button
          v-for="invoice in data.overdue"
          :key="`overdue-${invoice.id}`"
          type="button"
          @click="navigate(`/invoices/${invoice.id}`)"
        >
          <i class="bi bi-exclamation-circle notification-danger"></i>
          <span>
            <strong>{{ invoice.invoiceNumber }}</strong>
            <small>
              {{ invoice.customer?.name }} · Due {{ formatDate(invoice.dueDate) }}
            </small>
          </span>
          <b>{{ formatMoney(invoice.balanceDue) }}</b>
        </button>

        <div v-if="data.outstanding.length" class="notification-section-label">
          បំណុលនៅសល់
        </div>
        <button
          v-for="invoice in data.outstanding.slice(0, 5)"
          :key="`outstanding-${invoice.id}`"
          type="button"
          @click="navigate(`/invoices/${invoice.id}`)"
        >
          <i class="bi bi-cash-coin notification-info"></i>
          <span>
            <strong>{{ invoice.invoiceNumber }}</strong>
            <small>{{ invoice.customer?.name }}</small>
          </span>
          <b>{{ formatMoney(invoice.balanceDue) }}</b>
        </button>

        <div v-if="data.lowStock.length" class="notification-section-label">
          ស្តុកជិតអស់
        </div>
        <button
          v-for="product in data.lowStock"
          :key="`stock-${product.id}`"
          type="button"
          @click="
            navigate({
              path: '/products',
              query: { search: product.itemCode || product.name },
            })
          "
        >
          <i class="bi bi-box-seam notification-warning"></i>
          <span>
            <strong>{{ product.name }}</strong>
            <small>{{ product.itemCode || 'No item code' }}</small>
          </span>
          <b>{{ product.stockQuantity || 0 }} {{ product.unit }}</b>
        </button>

        <div
          v-if="
            !data.overdue.length &&
            !data.outstanding.length &&
            !data.lowStock.length
          "
          class="notification-empty"
        >
          <i class="bi bi-check-circle"></i>
          <span>មិនមានការជូនដំណឹងបន្ទាន់</span>
        </div>
      </div>

      <div v-else class="notification-list">
        <button
          v-for="activity in data.activity"
          :key="activity.id"
          type="button"
          @click="navigate('/audit-logs')"
        >
          <i class="bi bi-clock-history notification-info"></i>
          <span>
            <strong>{{ activity.actorUsername }} · {{ activity.action }}</strong>
            <small>{{ activity.summary || activity.entityType }}</small>
          </span>
        </button>
        <div v-if="!data.activity.length" class="notification-empty">
          មិនទាន់មានសកម្មភាព
        </div>
      </div>

      <footer>
        <button
          v-if="canManageBilling"
          class="notification-telegram-action"
          type="button"
          :disabled="sendingDebt || !telegramConfigured"
          :title="
            telegramConfigured
              ? 'ផ្ញើសេចក្តីជូនដំណឹងបំណុលទៅ Telegram'
              : 'Telegram Bot មិនទាន់បានកំណត់នៅ Server'
          "
          @click="sendDebtTelegram"
        >
          <span>
            <i class="bi bi-telegram"></i>
            {{ sendingDebt ? 'កំពុងផ្ញើ...' : 'ផ្ញើ Debt Alert' }}
          </span>
        </button>
        <button type="button" @click="navigate('/reports')">
          មើល Reports និងបំណុលសរុប
          <i class="bi bi-arrow-right"></i>
        </button>
      </footer>
    </section>
  </div>
</template>
