<script setup>
import { computed, onMounted, ref } from 'vue'
import { invoiceApi, reportApi } from '../api/invoices'
import { isOwner } from '../auth/session'
import ErrorState from '../components/ErrorState.vue'
import { formatDate, formatMoney } from '../utils/invoice'
import { showToast } from '../ui/feedback'

const metrics = ref(null)
const loading = ref(true)
const exporting = ref('')
const error = ref('')

const statusChart = computed(() => {
  const totals = metrics.value?.totalsByStatus || {}
  return [
    { key: 'draft', label: 'Draft', color: '#8b98aa', value: totals.draft || 0 },
    { key: 'unpaid', label: 'Unpaid', color: '#dc2635', value: totals.unpaid || 0 },
    {
      key: 'partially_paid',
      label: 'Partially Paid',
      color: '#f1b91b',
      value: totals.partially_paid || 0,
    },
    { key: 'paid', label: 'Paid', color: '#15956b', value: totals.paid || 0 },
    {
      key: 'cancelled',
      label: 'Cancelled',
      color: '#485568',
      value: totals.cancelled || 0,
    },
  ]
})

const statusTotal = computed(() =>
  statusChart.value.reduce((total, item) => total + item.value, 0),
)

const donutGradient = computed(() => {
  if (!statusTotal.value) return '#e8edf3'
  let current = 0
  const segments = statusChart.value.map((item) => {
    const start = current
    current += (item.value / statusTotal.value) * 100
    return `${item.color} ${start}% ${current}%`
  })
  return `conic-gradient(${segments.join(', ')})`
})

const cashTotal = computed(
  () =>
    Number(metrics.value?.revenue || 0) +
    Number(metrics.value?.outstanding || 0),
)

const moneyPercent = (value) =>
  cashTotal.value
    ? Math.max(2, (Number(value || 0) / cashTotal.value) * 100)
    : 0

const loadDashboard = async () => {
  loading.value = true
  error.value = ''
  try {
    metrics.value = (await invoiceApi.dashboard()).data
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to load dashboard'
  } finally {
    loading.value = false
  }
}

const download = async (type) => {
  exporting.value = type
  error.value = ''
  try {
    if (type === 'csv') await reportApi.exportCsv()
    else await reportApi.backup()
    showToast(
      type === 'csv'
        ? 'ទាញយក CSV បានជោគជ័យ'
        : 'ទាញយក Database Backup បានជោគជ័យ',
    )
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to download report'
    showToast(error.value, 'error')
  } finally {
    exporting.value = ''
  }
}

onMounted(loadDashboard)
</script>

<template>
  <section class="container page-section">
    <div class="page-heading dashboard-page-heading">
      <div>
        <span class="eyebrow">BUSINESS OVERVIEW</span>
        <h1>ផ្ទាំងគ្រប់គ្រង</h1>
        <p>តាមដានចំណូល បំណុល និងស្ថានភាពវិក្កយបត្រ។</p>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <button
          class="btn btn-outline-success"
          type="button"
          :disabled="Boolean(exporting)"
          @click="download('csv')"
        >
          <i class="bi bi-file-earmark-spreadsheet me-1"></i>
          {{ exporting === 'csv' ? 'កំពុងទាញ...' : 'Export CSV' }}
        </button>
        <button
          v-if="isOwner"
          class="btn btn-outline-primary"
          type="button"
          :disabled="Boolean(exporting)"
          @click="download('backup')"
        >
          <i class="bi bi-database-down me-1"></i>
          {{ exporting === 'backup' ? 'កំពុងទាញ...' : 'Backup JSON' }}
        </button>
      </div>
    </div>

    <ErrorState
      v-if="error && !metrics"
      :message="error"
      :retrying="loading"
      @retry="loadDashboard"
    />
    <div v-else-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="loading" class="dashboard-skeleton">
      <div v-for="index in 4" :key="index" class="skeleton-block"></div>
    </div>

    <template v-else-if="metrics">
      <div class="row g-3 mb-4">
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-blue-soft"><i class="bi bi-cash-stack"></i></div>
            <div>
              <span>ចំណូលបានទទួល</span>
              <strong>{{ formatMoney(metrics.revenue) }}</strong>
              <small class="summary-meta">Payments received</small>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-red-soft"><i class="bi bi-hourglass-split"></i></div>
            <div>
              <span>បំណុលនៅសល់</span>
              <strong>{{ formatMoney(metrics.outstanding) }}</strong>
              <small class="summary-meta">Needs collection</small>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-green-soft"><i class="bi bi-check2-circle"></i></div>
            <div>
              <span>វិក្កយបត្របង់រួច</span>
              <strong>{{ metrics.paidInvoices }}</strong>
              <small class="summary-meta">Invoices completed</small>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-yellow-soft"><i class="bi bi-receipt"></i></div>
            <div>
              <span>វិក្កយបត្រសរុប</span>
              <strong>{{ metrics.totalInvoices }}</strong>
              <small class="summary-meta">All invoice records</small>
            </div>
          </div>
        </div>
      </div>

      <div class="row g-4">
        <div class="col-lg-5">
          <div class="content-card dashboard-chart-card">
            <h2 class="panel-title">ស្ថានភាពវិក្កយបត្រ</h2>
            <div class="status-chart-layout">
              <div
                class="status-donut"
                :style="{ background: donutGradient }"
              >
                <div class="status-donut-center">
                  <strong>{{ statusTotal }}</strong>
                  <span>INVOICES</span>
                </div>
              </div>
              <div class="chart-legend">
                <div
                  v-for="item in statusChart"
                  :key="item.key"
                  class="chart-legend-item"
                >
                  <i :style="{ background: item.color }"></i>
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
            </div>

            <div class="money-bars">
              <div>
                <div class="money-bar-heading">
                  <span>ចំណូលបានទទួល</span>
                  <strong>{{ formatMoney(metrics.revenue) }}</strong>
                </div>
                <div class="money-bar-track">
                  <div
                    class="money-bar-fill"
                    :style="{ width: `${moneyPercent(metrics.revenue)}%` }"
                  ></div>
                </div>
              </div>
              <div>
                <div class="money-bar-heading">
                  <span>បំណុលនៅសល់</span>
                  <strong>{{ formatMoney(metrics.outstanding) }}</strong>
                </div>
                <div class="money-bar-track">
                  <div
                    class="money-bar-fill outstanding"
                    :style="{ width: `${moneyPercent(metrics.outstanding)}%` }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="content-card">
            <div class="card-toolbar">
              <h2 class="panel-title mb-0">វិក្កយបត្រថ្មីៗ</h2>
              <RouterLink to="/invoices">មើលទាំងអស់</RouterLink>
            </div>
            <div class="table-responsive">
              <table class="table invoice-table responsive-table mb-0">
                <thead><tr><th>លេខ</th><th>អតិថិជន</th><th>ប្រភពលក់</th><th>ថ្ងៃ</th><th class="text-end">នៅសល់</th></tr></thead>
                <tbody>
                  <tr v-for="invoice in metrics.recentInvoices" :key="invoice.id">
                    <td class="mobile-card-primary" data-label="លេខ"><RouterLink class="invoice-number" :to="`/invoices/${invoice.id}`">{{ invoice.invoiceNumber }}</RouterLink></td>
                    <td data-label="អតិថិជន">{{ invoice.customer?.name }}</td>
                    <td data-label="ប្រភពលក់">
                      {{
                        invoice.salesChannel === 'salesperson'
                          ? invoice.salesperson?.name || 'Sale'
                          : 'នៅហាង'
                      }}
                    </td>
                    <td data-label="ថ្ងៃ">{{ formatDate(invoice.invoiceDate) }}</td>
                    <td class="text-end fw-bold" data-label="នៅសល់">{{ formatMoney(invoice.balanceDue) }}</td>
                  </tr>
                  <tr v-if="!metrics.recentInvoices.length"><td colspan="5" class="text-center text-secondary py-4">មិនទាន់មានវិក្កយបត្រ</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
