<script setup>
import { onMounted, reactive, ref } from 'vue'
import InvoiceTableRow from '../components/InvoiceTableRow.vue'
import ErrorState from '../components/ErrorState.vue'
import PaginationControls from '../components/PaginationControls.vue'
import TableSkeleton from '../components/TableSkeleton.vue'
import { invoiceApi, salespersonApi } from '../api/invoices'
import { canManageBilling } from '../auth/session'
import {
  requestConfirmation,
  showToast,
} from '../ui/feedback'

const invoices = ref([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const status = ref('')
const salesChannel = ref('')
const salespersonId = ref('')
const salespeople = ref([])
const showTrash = ref(false)
const pagination = reactive({
  page: 1,
  limit: 10,
  total: 0,
  pages: 1,
})

const loadInvoices = async (page = pagination.page) => {
  loading.value = true
  error.value = ''
  try {
    const response = await invoiceApi.list({
      search: search.value,
      status: status.value,
      salesChannel: salesChannel.value,
      salespersonId: salespersonId.value,
      deleted: showTrash.value,
      page,
      limit: pagination.limit,
    })
    invoices.value = response.data.items || []
    Object.assign(pagination, response.data.pagination)
  } catch (requestError) {
    invoices.value = []
    error.value =
      requestError.response?.data?.message || 'មិនអាចទាញយកបញ្ជីវិក្កយបត្របានទេ'
  } finally {
    loading.value = false
  }
}

let searchTimer
const handleSearch = () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadInvoices(1), 300)
}

const deleteInvoice = async (invoice) => {
  const confirmed = await requestConfirmation({
    title: 'លុបវិក្កយបត្រ?',
    message: `វិក្កយបត្រ ${invoice.invoiceNumber} នឹងត្រូវផ្លាស់ទីទៅធុងសំរាម។`,
    confirmLabel: 'ផ្លាស់ទីទៅធុងសំរាម',
    cancelLabel: 'បោះបង់',
    tone: 'danger',
  })
  if (!confirmed) return

  try {
    await invoiceApi.remove(invoice.id)
    showToast('វិក្កយបត្រត្រូវបានផ្លាស់ទីទៅធុងសំរាម')
    await loadInvoices(pagination.page)
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចលុបវិក្កយបត្របានទេ'
    showToast(error.value, 'error')
  }
}

const restoreInvoice = async (invoice) => {
  try {
    await invoiceApi.restore(invoice.id)
    showToast('ស្ដារវិក្កយបត្របានជោគជ័យ')
    await loadInvoices(pagination.page)
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចស្ដារវិក្កយបត្របានទេ'
    showToast(error.value, 'error')
  }
}

const toggleTrash = () => {
  showTrash.value = !showTrash.value
  status.value = ''
  salesChannel.value = ''
  salespersonId.value = ''
  loadInvoices(1)
}

const changeSalesChannel = () => {
  if (salesChannel.value !== 'salesperson') salespersonId.value = ''
  loadInvoices(1)
}

const initialize = async () => {
  try {
    const { data } = await salespersonApi.list({ limit: 100 })
    salespeople.value = data.items || []
  } catch {
    salespeople.value = []
  }
  await loadInvoices()
}

onMounted(initialize)
</script>

<template>
  <section class="container page-section">
    <div class="page-heading">
      <div>
        <span class="eyebrow">{{ showTrash ? 'INVOICE TRASH' : 'BILLING OVERVIEW' }}</span>
        <h1>{{ showTrash ? 'វិក្កយបត្រដែលបានលុប' : 'បញ្ជីវិក្កយបត្រ' }}</h1>
        <p>គ្រប់គ្រង ស្វែងរក តាមដានការបង់ប្រាក់ និងស្ដារទិន្នន័យ។</p>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <button class="btn btn-outline-secondary" type="button" @click="toggleTrash">
          <i :class="showTrash ? 'bi bi-arrow-left' : 'bi bi-trash3'" class="me-1"></i>
          {{ showTrash ? 'ត្រឡប់ទៅបញ្ជី' : 'ធុងសំរាម' }}
        </button>
        <RouterLink
          v-if="canManageBilling && !showTrash"
          class="btn btn-danger btn-lg"
          to="/invoices/new"
        >
          <i class="bi bi-plus-lg me-2"></i> វិក្កយបត្រថ្មី
        </RouterLink>
      </div>
    </div>

    <div class="content-card">
      <div class="card-toolbar flex-wrap">
        <div class="search-box">
          <i class="bi bi-search"></i>
          <input
            v-model="search"
            class="form-control"
            type="search"
            placeholder="ស្វែងរកលេខវិក្កយបត្រ ឈ្មោះ ឬទូរស័ព្ទ..."
            @input="handleSearch"
          />
        </div>
        <select
          v-if="!showTrash"
          v-model="status"
          class="form-select filter-select"
          @change="loadInvoices(1)"
        >
          <option value="">ស្ថានភាពទាំងអស់</option>
          <option value="draft">Draft</option>
          <option value="unpaid">Unpaid</option>
          <option value="partially_paid">Partially Paid</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          v-if="!showTrash"
          v-model="salesChannel"
          class="form-select filter-select"
          @change="changeSalesChannel"
        >
          <option value="">ប្រភពលក់ទាំងអស់</option>
          <option value="store">ទិញនៅហាងផ្ទាល់</option>
          <option value="salesperson">Sale ជាអ្នកលក់</option>
        </select>
        <select
          v-if="!showTrash && salesChannel === 'salesperson'"
          v-model="salespersonId"
          class="form-select filter-select"
          @change="loadInvoices(1)"
        >
          <option value="">Sale ទាំងអស់</option>
          <option
            v-for="salesperson in salespeople"
            :key="salesperson.id"
            :value="salesperson.id"
          >
            {{ salesperson.name }}
          </option>
        </select>
        <button class="btn btn-outline-secondary" type="button" @click="loadInvoices(pagination.page)">
          <i class="bi bi-arrow-clockwise me-1"></i> ផ្ទុកឡើងវិញ
        </button>
      </div>

      <ErrorState
        v-if="error && !invoices.length"
        class="m-3"
        :message="error"
        :retrying="loading"
        @retry="loadInvoices(pagination.page)"
      />
      <div v-else-if="error" class="alert alert-danger mx-3 mt-3">{{ error }}</div>
      <TableSkeleton v-if="loading" />
      <div v-else-if="!error && !invoices.length" class="empty-state">
        <div class="empty-icon"><i class="bi bi-receipt-cutoff"></i></div>
        <h3>មិនមានវិក្កយបត្រ</h3>
        <p>{{ showTrash ? 'ធុងសំរាមនៅទទេ។' : 'ចាប់ផ្តើមដោយបង្កើតវិក្កយបត្រដំបូង។' }}</p>
        <RouterLink
          v-if="canManageBilling && !showTrash"
          class="btn btn-danger"
          to="/invoices/new"
        >
          <i class="bi bi-plus-lg me-1"></i> បង្កើតវិក្កយបត្រ
        </RouterLink>
      </div>
      <div v-else class="table-responsive">
        <table class="table invoice-table responsive-table align-middle mb-0">
          <thead>
            <tr>
              <th>លេខវិក្កយបត្រ</th>
              <th>អតិថិជន</th>
              <th>ប្រភពលក់</th>
              <th>ថ្ងៃកំណត់</th>
              <th>ស្ថានភាព</th>
              <th class="text-end">សរុប</th>
              <th class="text-end">នៅសល់</th>
              <th class="text-end">សកម្មភាព</th>
            </tr>
          </thead>
          <tbody>
            <InvoiceTableRow
              v-for="invoice in invoices"
              :key="invoice.id"
              :invoice="invoice"
              :deleted="showTrash"
              :can-manage="canManageBilling"
              @delete="deleteInvoice"
              @restore="restoreInvoice"
            />
          </tbody>
        </table>
      </div>
      <PaginationControls :pagination="pagination" @change="loadInvoices" />
    </div>
  </section>
</template>
