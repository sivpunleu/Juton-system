<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { reportApi, salespersonApi } from '../api/invoices'
import { isOwner } from '../auth/session'
import ContentSkeleton from '../components/ContentSkeleton.vue'
import ErrorState from '../components/ErrorState.vue'
import TableSkeleton from '../components/TableSkeleton.vue'
import {
  formatDate,
  formatMoney,
  invoiceStatusLabels,
  resolveInvoiceStatus,
  toDateInput,
} from '../utils/invoice'
import {
  requestConfirmation,
  showToast,
  validateForm,
} from '../ui/feedback'

const report = ref(null)
const analytics = ref(null)
const loading = ref(true)
const error = ref('')
const salespeople = ref([])
const backups = ref([])
const backupMeta = ref(null)
const backupLoading = ref(false)
const backupAction = ref('')
const uploadedBackup = ref(null)
const uploadedBackupName = ref('')
const filters = reactive({
  from: toDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  to: toDateInput(),
  groupBy: 'day',
  salesChannel: '',
  salespersonId: '',
})

const maxRevenue = computed(() =>
  Math.max(1, ...(report.value?.trend || []).map((item) => item.revenue)),
)
const maxMonthlyPaid = computed(() =>
  Math.max(
    1,
    ...(analytics.value?.monthlyRevenue || []).map((item) => item.paid),
  ),
)
const maxBestSellerAmount = computed(() =>
  Math.max(
    1,
    ...(analytics.value?.bestSellingProducts || []).map((item) => item.amount),
  ),
)
const maxDebtAmount = computed(() =>
  Math.max(1, ...(analytics.value?.debtAging || []).map((item) => item.amount)),
)

const loadReport = async () => {
  loading.value = true
  error.value = ''
  try {
    const [revenueResponse, analyticsResponse] = await Promise.all([
      reportApi.revenue(filters),
      reportApi.analytics({
        from: filters.from,
        to: filters.to,
      }),
    ])
    report.value = revenueResponse.data
    analytics.value = analyticsResponse.data
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to load report'
    showToast(error.value, 'error')
  } finally {
    loading.value = false
  }
}

const submitReport = async (event) => {
  const customMessage =
    filters.from &&
    filters.to &&
    new Date(filters.from) > new Date(filters.to)
      ? 'កាលបរិច្ឆេទ From មិនអាចក្រោយកាលបរិច្ឆេទ To បានទេ។'
      : ''
  if (
    !(await validateForm(event?.currentTarget, {
      customMessage,
    }))
  ) return
  await loadReport()
}

const applyPreset = (preset) => {
  const now = new Date()
  if (preset === 'today') {
    filters.from = toDateInput(now)
    filters.to = toDateInput(now)
    filters.groupBy = 'day'
  } else if (preset === 'month') {
    filters.from = toDateInput(
      new Date(now.getFullYear(), now.getMonth(), 1),
    )
    filters.to = toDateInput(now)
    filters.groupBy = 'day'
  } else {
    filters.from = toDateInput(new Date(now.getFullYear(), 0, 1))
    filters.to = toDateInput(now)
    filters.groupBy = 'month'
  }
  loadReport()
}

const changeSalesChannel = () => {
  if (filters.salesChannel !== 'salesperson') filters.salespersonId = ''
}

const snapshotCounts = (item = {}) =>
  item.counts ||
  item.metadata?.counts || {
    invoices: item.invoices?.length || 0,
    customers: item.customers?.length || 0,
    products: item.products?.length || 0,
    salespeople: item.salespeople?.length || 0,
    auditLogs: item.auditLogs?.length || 0,
  }

const backupCountLabel = (item) => {
  const counts = snapshotCounts(item)
  return `${counts.invoices || 0} invoices · ${counts.customers || 0} customers · ${counts.products || 0} products`
}

const loadBackups = async () => {
  if (!isOwner.value) return
  backupLoading.value = true
  try {
    const { data } = await reportApi.backups({ limit: 10 })
    backups.value = data.items || []
    backupMeta.value = data
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message || 'Unable to load backups',
      'error',
    )
  } finally {
    backupLoading.value = false
  }
}

const runBackupNow = async () => {
  backupAction.value = 'run'
  try {
    await reportApi.createBackup({ reason: 'Manual backup from Reports page' })
    showToast('Backup snapshot created')
    await loadBackups()
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message || 'Unable to create backup',
      'error',
    )
  } finally {
    backupAction.value = ''
  }
}

const downloadSnapshot = async (snapshot) => {
  backupAction.value = `download-${snapshot.id}`
  try {
    await reportApi.downloadBackup(snapshot.id)
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message || 'Unable to download backup',
      'error',
    )
  } finally {
    backupAction.value = ''
  }
}

const confirmRestore = async (message) => {
  const value = await requestConfirmation({
    title: 'Restore database?',
    message,
    confirmLabel: 'Restore',
    cancelLabel: 'Cancel',
    tone: 'danger',
    inputType: 'text',
    inputLabel: 'Type RESTORE to confirm',
    inputPlaceholder: 'RESTORE',
    inputMinLength: 7,
  })
  if (value === false) return false
  if (String(value).trim() !== 'RESTORE') {
    showToast('Restore cancelled: confirmation text did not match', 'error')
    return false
  }
  return true
}

const restoreSnapshot = async (snapshot) => {
  const confirmed = await confirmRestore(
    `This will replace business data with snapshot ${formatDate(snapshot.createdAt)}. A safety backup will be created first.`,
  )
  if (!confirmed) return

  backupAction.value = `restore-${snapshot.id}`
  try {
    await reportApi.restoreBackup(snapshot.id)
    showToast('Database restored from snapshot')
    await Promise.all([loadBackups(), loadReport()])
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message || 'Unable to restore backup',
      'error',
    )
  } finally {
    backupAction.value = ''
  }
}

const handleBackupFile = async (event) => {
  const file = event.target.files?.[0]
  uploadedBackup.value = null
  uploadedBackupName.value = ''
  if (!file) return

  try {
    uploadedBackup.value = JSON.parse(await file.text())
    uploadedBackupName.value = file.name
    showToast('Backup JSON loaded')
  } catch {
    showToast('Invalid JSON backup file', 'error')
    event.target.value = ''
  }
}

const restoreUploaded = async () => {
  if (!uploadedBackup.value) {
    showToast('Please choose a backup JSON file first', 'error')
    return
  }
  const counts = snapshotCounts(uploadedBackup.value)
  const confirmed = await confirmRestore(
    `This will restore ${counts.invoices || 0} invoices, ${counts.customers || 0} customers, and ${counts.products || 0} products from ${uploadedBackupName.value}.`,
  )
  if (!confirmed) return

  backupAction.value = 'restore-upload'
  try {
    await reportApi.restoreUploadedBackup(uploadedBackup.value)
    showToast('Database restored from uploaded backup')
    uploadedBackup.value = null
    uploadedBackupName.value = ''
    await Promise.all([loadBackups(), loadReport()])
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message || 'Unable to restore backup',
      'error',
    )
  } finally {
    backupAction.value = ''
  }
}

const initialize = async () => {
  try {
    const { data } = await salespersonApi.list({ limit: 100 })
    salespeople.value = data.items || []
  } catch {
    salespeople.value = []
  }
  await Promise.all([loadReport(), loadBackups()])
}

onMounted(initialize)
</script>

<template>
  <section class="container page-section">
    <div class="page-heading">
      <div>
        <span class="eyebrow">REVENUE ANALYTICS</span>
        <h1>Reports</h1>
        <p>មើលចំណូល វិក្កយបត្រ និងបំណុលតាមថ្ងៃ ខែ ឬឆ្នាំ។</p>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <button class="btn btn-outline-secondary" @click="applyPreset('today')">
          Today
        </button>
        <button class="btn btn-outline-secondary" @click="applyPreset('month')">
          This Month
        </button>
        <button class="btn btn-outline-secondary" @click="applyPreset('year')">
          This Year
        </button>
      </div>
    </div>

    <form
      class="content-card form-card report-filters mb-4"
      novalidate
      @submit.prevent="submitReport"
    >
      <div>
        <label class="form-label">From *</label>
        <input v-model="filters.from" class="form-control" type="date" required />
      </div>
      <div>
        <label class="form-label">To *</label>
        <input v-model="filters.to" class="form-control" type="date" required />
      </div>
      <div>
        <label class="form-label">Group By</label>
        <select v-model="filters.groupBy" class="form-select">
          <option value="day">Day</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
        </select>
      </div>
      <div>
        <label class="form-label">Sales Source</label>
        <select
          v-model="filters.salesChannel"
          class="form-select"
          @change="changeSalesChannel"
        >
          <option value="">All Sources</option>
          <option value="store">ទិញនៅហាងផ្ទាល់</option>
          <option value="salesperson">Sale ជាអ្នកលក់</option>
        </select>
      </div>
      <div>
        <label class="form-label">Salesperson</label>
        <select
          v-model="filters.salespersonId"
          class="form-select"
          :disabled="filters.salesChannel !== 'salesperson'"
        >
          <option value="">All Salespeople</option>
          <option
            v-for="salesperson in salespeople"
            :key="salesperson.id"
            :value="salesperson.id"
          >
            {{ salesperson.name }}
          </option>
        </select>
      </div>
      <button class="btn btn-danger" type="submit" :disabled="loading">
        <i class="bi bi-funnel me-1"></i> Apply Filter
      </button>
    </form>

    <div v-if="isOwner" class="content-card form-card mb-4">
      <div class="card-toolbar align-items-start">
        <div>
          <h2 class="panel-title mb-1">Backup & Restore</h2>
          <small class="text-secondary">
            Daily backup: {{ backupMeta?.automaticEnabled ? 'Enabled' : 'Disabled' }}
            · {{ backupMeta?.backupTimeUtc || '02:00' }} UTC
            · retention {{ backupMeta?.retentionDays || 30 }} days
          </small>
        </div>
        <button
          class="btn btn-outline-primary"
          type="button"
          :disabled="Boolean(backupAction)"
          @click="runBackupNow"
        >
          <span
            v-if="backupAction === 'run'"
            class="spinner-border spinner-border-sm me-1"
          ></span>
          <i v-else class="bi bi-database-add me-1"></i>
          Run Backup Now
        </button>
      </div>

      <div class="row g-3">
        <div class="col-lg-7">
          <div class="table-responsive">
            <table class="table invoice-table responsive-table mb-0">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Type</th>
                  <th>Records</th>
                  <th class="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="snapshot in backups" :key="snapshot.id">
                  <td class="mobile-card-primary" data-label="Created">
                    {{ formatDate(snapshot.createdAt) }}
                    <small class="d-block text-secondary">
                      {{ snapshot.createdBy || 'system' }}
                    </small>
                  </td>
                  <td data-label="Type">
                    <span class="role-badge">{{ snapshot.type }}</span>
                  </td>
                  <td data-label="Records">{{ backupCountLabel(snapshot) }}</td>
                  <td class="text-end" data-label="Actions">
                    <div class="d-inline-flex flex-wrap gap-1 justify-content-end">
                      <button
                        class="btn btn-sm btn-outline-secondary"
                        type="button"
                        :disabled="Boolean(backupAction)"
                        @click="downloadSnapshot(snapshot)"
                      >
                        <span
                          v-if="backupAction === `download-${snapshot.id}`"
                          class="spinner-border spinner-border-sm"
                        ></span>
                        <i v-else class="bi bi-download"></i>
                      </button>
                      <button
                        class="btn btn-sm btn-outline-danger"
                        type="button"
                        :disabled="Boolean(backupAction)"
                        @click="restoreSnapshot(snapshot)"
                      >
                        <span
                          v-if="backupAction === `restore-${snapshot.id}`"
                          class="spinner-border spinner-border-sm"
                        ></span>
                        <i v-else class="bi bi-arrow-counterclockwise"></i>
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!backupLoading && !backups.length">
                  <td colspan="4" class="text-center text-secondary py-4">
                    No backup snapshots yet
                  </td>
                </tr>
                <tr v-if="backupLoading">
                  <td colspan="4" class="text-center text-secondary py-4">
                    Loading backups...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="col-lg-5">
          <div class="restore-upload-card">
            <label class="form-label">Restore from JSON file</label>
            <input
              class="form-control"
              type="file"
              accept="application/json,.json"
              @change="handleBackupFile"
            />
            <div v-if="uploadedBackup" class="alert alert-warning mt-3 mb-3">
              <strong>{{ uploadedBackupName }}</strong>
              <span class="d-block">{{ backupCountLabel(uploadedBackup) }}</span>
            </div>
            <button
              class="btn btn-danger w-100"
              type="button"
              :disabled="!uploadedBackup || Boolean(backupAction)"
              @click="restoreUploaded"
            >
              <span
                v-if="backupAction === 'restore-upload'"
                class="spinner-border spinner-border-sm me-1"
              ></span>
              <i v-else class="bi bi-upload me-1"></i>
              Restore Uploaded Backup
            </button>
            <small class="d-block text-secondary mt-2">
              Restore replaces business data. Admin accounts are not restored
              from backup files.
            </small>
          </div>
        </div>
      </div>
    </div>

    <ErrorState
      v-if="error && !report"
      :message="error"
      :retrying="loading"
      @retry="loadReport"
    />
    <div v-else-if="error" class="alert alert-danger">{{ error }}</div>
    <ContentSkeleton v-if="loading" :cards="4" />

    <template v-else-if="report">
      <div class="row g-3 mb-4">
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-green-soft">
              <i class="bi bi-cash-stack"></i>
            </div>
            <div>
              <span>ចំណូលបានទទួល</span>
              <strong>{{ formatMoney(report.summary.revenue) }}</strong>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-blue-soft">
              <i class="bi bi-receipt"></i>
            </div>
            <div>
              <span>ទឹកប្រាក់វិក្កយបត្រ</span>
              <strong>{{ formatMoney(report.summary.invoiced) }}</strong>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-red-soft">
              <i class="bi bi-hourglass-split"></i>
            </div>
            <div>
              <span>បំណុលនៅសល់</span>
              <strong>{{ formatMoney(report.summary.outstanding) }}</strong>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-yellow-soft">
              <i class="bi bi-files"></i>
            </div>
            <div>
              <span>វិក្កយបត្រសរុប</span>
              <strong>{{ report.summary.invoiceCount }}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="content-card form-card mb-4">
        <div class="report-chart-heading">
          <div>
            <h2 class="panel-title mb-1">Revenue Trend</h2>
            <small class="text-secondary">
              {{ formatDate(report.range.from) }} -
              {{ formatDate(report.range.to) }}
            </small>
          </div>
          <div class="chart-key">
            <span><i class="chart-key-dot revenue"></i> Paid revenue</span>
          </div>
        </div>
        <div v-if="report.trend.length" class="revenue-chart">
          <div
            v-for="item in report.trend"
            :key="item.label"
            class="revenue-column"
          >
            <span>{{ formatMoney(item.revenue) }}</span>
            <div class="revenue-column-track">
              <i
                :style="{
                  height: `${Math.max(4, (item.revenue / maxRevenue) * 100)}%`,
                }"
              ></i>
            </div>
            <small>{{ item.label }}</small>
          </div>
        </div>
        <div v-else class="empty-state report-empty">
          <i class="bi bi-bar-chart"></i>
          <span>មិនមានចំណូលក្នុងរយៈពេលនេះ</span>
        </div>
      </div>

      <div v-if="analytics" class="content-card form-card mb-4">
        <div class="card-toolbar">
          <div>
            <h2 class="panel-title mb-1">Business Analytics</h2>
            <small class="text-secondary">
              Monthly revenue, best-selling products, customer debt aging, and low stock
            </small>
          </div>
          <span class="role-badge">{{ analytics.summary.invoiceCount }} invoices</span>
        </div>
        <div class="chart-key analytics-key">
          <span><i class="chart-key-dot revenue"></i> Monthly paid</span>
          <span><i class="chart-key-dot best"></i> Product sales</span>
          <span><i class="chart-key-dot debt"></i> Debt aging</span>
        </div>

        <div class="analytics-strip">
          <div>
            <span>Invoiced</span>
            <strong>{{ formatMoney(analytics.summary.invoiced) }}</strong>
          </div>
          <div>
            <span>Paid</span>
            <strong>{{ formatMoney(analytics.summary.paid) }}</strong>
          </div>
          <div>
            <span>Outstanding</span>
            <strong>{{ formatMoney(analytics.summary.outstanding) }}</strong>
          </div>
          <div>
            <span>Low Stock</span>
            <strong>{{ analytics.lowStock.length }}</strong>
          </div>
        </div>

        <div class="analytics-grid">
          <section class="analytics-block">
            <h3>Monthly Revenue</h3>
            <div
              v-for="item in analytics.monthlyRevenue"
              :key="item.label"
              class="analytics-row"
            >
              <div class="analytics-row-heading">
                <span>{{ item.label }}</span>
                <strong>{{ formatMoney(item.paid) }}</strong>
              </div>
              <div class="analytics-bar-track">
                <i
                  class="analytics-bar-fill revenue"
                  :style="{ width: `${Math.max(4, (item.paid / maxMonthlyPaid) * 100)}%` }"
                ></i>
              </div>
            </div>
            <p v-if="!analytics.monthlyRevenue.length" class="analytics-empty">
              No monthly revenue in this range
            </p>
          </section>

          <section class="analytics-block">
            <h3>Best-Selling Products</h3>
            <div
              v-for="item in analytics.bestSellingProducts"
              :key="item.key"
              class="analytics-row"
            >
              <div class="analytics-row-heading">
                <span>{{ item.productName }}</span>
                <strong>{{ item.quantity }} {{ item.unit }} / {{ formatMoney(item.amount) }}</strong>
              </div>
              <div class="analytics-bar-track">
                <i
                  class="analytics-bar-fill best"
                  :style="{ width: `${Math.max(4, (item.amount / maxBestSellerAmount) * 100)}%` }"
                ></i>
              </div>
            </div>
            <p v-if="!analytics.bestSellingProducts.length" class="analytics-empty">
              No product sales in this range
            </p>
          </section>

          <section class="analytics-block">
            <h3>Debt Aging</h3>
            <div
              v-for="item in analytics.debtAging"
              :key="item.bucket"
              class="analytics-row"
            >
              <div class="analytics-row-heading">
                <span>{{ item.bucket }}</span>
                <strong>{{ formatMoney(item.amount) }}</strong>
              </div>
              <div class="analytics-bar-track">
                <i
                  class="analytics-bar-fill debt"
                  :style="{ width: `${Math.max(4, (item.amount / maxDebtAmount) * 100)}%` }"
                ></i>
              </div>
            </div>
          </section>
        </div>

        <div class="analytics-low-stock">
          <div class="card-toolbar">
            <h3>Low Stock Watchlist</h3>
            <span class="role-badge">{{ analytics.lowStock.length }} products</span>
          </div>
          <div class="table-responsive">
            <table class="table invoice-table responsive-table mb-0">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Item Code</th>
                  <th class="text-end">Stock</th>
                  <th class="text-end">Threshold</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="product in analytics.lowStock" :key="product.id">
                  <td class="mobile-card-primary" data-label="Product">
                    {{ product.name }}
                  </td>
                  <td data-label="Item Code">{{ product.itemCode || '-' }}</td>
                  <td class="text-end" data-label="Stock">
                    {{ product.stockQuantity }} {{ product.unit }}
                  </td>
                  <td class="text-end" data-label="Threshold">
                    {{ product.lowStockThreshold }} {{ product.unit }}
                  </td>
                </tr>
                <tr v-if="!analytics.lowStock.length">
                  <td colspan="4" class="text-center text-secondary py-4">
                    No low-stock products
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="content-card mb-4">
        <div class="card-toolbar">
          <div>
            <h2 class="panel-title mb-1">Sales Performance</h2>
            <small class="text-secondary">
              ប្រៀបធៀបការលក់នៅហាង និង Sale នីមួយៗ
            </small>
          </div>
          <span class="role-badge">
            {{ report.salesPerformance?.length || 0 }} sources
          </span>
        </div>
        <div class="table-responsive">
          <table class="table invoice-table responsive-table mb-0">
            <thead>
              <tr>
                <th>Sales Source</th>
                <th class="text-end">Invoices</th>
                <th class="text-end">Invoiced</th>
                <th class="text-end">Paid</th>
                <th class="text-end">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in report.salesPerformance || []"
                :key="item.key"
              >
                <td class="mobile-card-primary" data-label="Sales Source">
                  <span
                    class="sales-source-badge"
                    :class="
                      item.salesChannel === 'salesperson'
                        ? 'sales-source-person'
                        : 'sales-source-store'
                    "
                  >
                    <i
                      :class="
                        item.salesChannel === 'salesperson'
                          ? 'bi bi-person-badge'
                          : 'bi bi-shop'
                      "
                    ></i>
                    {{ item.label }}
                  </span>
                </td>
                <td class="text-end" data-label="Invoices">
                  {{ item.invoiceCount }}
                </td>
                <td class="text-end fw-bold" data-label="Invoiced">
                  {{ formatMoney(item.invoiced) }}
                </td>
                <td class="text-end" data-label="Paid">
                  {{ formatMoney(item.paid) }}
                </td>
                <td class="text-end" data-label="Outstanding">
                  {{ formatMoney(item.outstanding) }}
                </td>
              </tr>
              <tr v-if="!report.salesPerformance?.length">
                <td colspan="5" class="text-center text-secondary py-4">
                  No sales data in this period
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="content-card mb-4">
        <div class="card-toolbar">
          <div>
            <h2 class="panel-title mb-1">Products by Sales Source</h2>
            <small class="text-secondary">
              ទំនិញដែលលក់នៅហាង និងទំនិញដែល Sale នីមួយៗបានលក់
            </small>
          </div>
          <span class="role-badge">
            {{ report.salesItems?.length || 0 }} items
          </span>
        </div>
        <div class="table-responsive">
          <table class="table invoice-table responsive-table mb-0">
            <thead>
              <tr>
                <th>Sales Source</th>
                <th>Product</th>
                <th>Color Code</th>
                <th class="text-end">Quantity</th>
                <th class="text-end">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in report.salesItems || []" :key="item.key">
                <td class="mobile-card-primary" data-label="Sales Source">
                  {{ item.sourceLabel }}
                </td>
                <td data-label="Product">{{ item.productName }}</td>
                <td data-label="Color Code">{{ item.colorCode || '-' }}</td>
                <td class="text-end" data-label="Quantity">
                  {{ item.quantity }} {{ item.unit }}
                </td>
                <td class="text-end fw-bold" data-label="Amount">
                  {{ formatMoney(item.amount) }}
                </td>
              </tr>
              <tr v-if="!report.salesItems?.length">
                <td colspan="5" class="text-center text-secondary py-4">
                  No product sales in this period
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="content-card">
        <div class="card-toolbar">
          <h2 class="panel-title mb-0">Invoices in Period</h2>
          <span class="role-badge">{{ report.invoices.length }} records</span>
        </div>
        <TableSkeleton v-if="loading" />
        <div v-else class="table-responsive">
          <table class="table invoice-table responsive-table mb-0">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Sales Source</th>
                <th>Date</th>
                <th>Status</th>
                <th class="text-end">Total</th>
                <th class="text-end">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="invoice in report.invoices" :key="invoice.id">
                <td class="mobile-card-primary" data-label="Invoice">
                  <RouterLink
                    class="invoice-number"
                    :to="`/invoices/${invoice.id}`"
                  >
                    {{ invoice.invoiceNumber }}
                  </RouterLink>
                </td>
                <td data-label="Customer">{{ invoice.customer?.name }}</td>
                <td data-label="Sales Source">
                  {{
                    invoice.salesChannel === 'salesperson'
                      ? invoice.salesperson?.name || 'Sale'
                      : 'នៅហាង'
                  }}
                </td>
                <td data-label="Date">{{ formatDate(invoice.invoiceDate) }}</td>
                <td data-label="Status">
                  <span
                    class="status-pill"
                    :class="`status-${resolveInvoiceStatus(invoice)}`"
                  >
                    {{
                      invoiceStatusLabels[resolveInvoiceStatus(invoice)] ||
                      resolveInvoiceStatus(invoice)
                    }}
                  </span>
                </td>
                <td class="text-end fw-bold" data-label="Total">
                  {{ formatMoney(invoice.grandTotal) }}
                </td>
                <td class="text-end" data-label="Balance">
                  {{ formatMoney(invoice.balanceDue) }}
                </td>
              </tr>
              <tr v-if="!report.invoices.length">
                <td colspan="7" class="text-center text-secondary py-4">
                  No invoices in this period
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>
