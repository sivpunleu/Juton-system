<script setup>
import { onMounted, reactive, ref } from 'vue'
import { auditApi } from '../api/invoices'
import ErrorState from '../components/ErrorState.vue'
import PaginationControls from '../components/PaginationControls.vue'
import TableSkeleton from '../components/TableSkeleton.vue'
import { formatDate } from '../utils/invoice'

const logs = ref([])
const loading = ref(true)
const error = ref('')
const action = ref('')
const entityType = ref('')
const pagination = reactive({ page: 1, limit: 20, total: 0, pages: 1 })

const loadLogs = async (page = pagination.page) => {
  loading.value = true
  error.value = ''
  try {
    const { data } = await auditApi.list({
      page,
      limit: pagination.limit,
      action: action.value,
      entityType: entityType.value,
    })
    logs.value = data.items || []
    Object.assign(pagination, data.pagination)
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to load audit logs'
  } finally {
    loading.value = false
  }
}

const formatTimestamp = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

onMounted(loadLogs)
</script>

<template>
  <section class="container page-section">
    <div class="page-heading">
      <div>
        <span class="eyebrow">SECURITY & HISTORY</span>
        <h1>Audit Log</h1>
        <p>កំណត់ត្រាអ្នកបង្កើត កែ លុប ស្តារ បង់ប្រាក់ និង export។</p>
      </div>
    </div>

    <ErrorState
      v-if="error && !logs.length"
      :message="error"
      :retrying="loading"
      @retry="loadLogs(pagination.page)"
    />
    <div v-else-if="error" class="alert alert-danger">{{ error }}</div>
    <div class="content-card">
      <div class="card-toolbar flex-wrap">
        <select v-model="action" class="form-select filter-select" @change="loadLogs(1)">
          <option value="">សកម្មភាពទាំងអស់</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="restore">Restore</option>
          <option value="payment">Payment</option>
          <option value="stock_in">Stock In</option>
          <option value="stock_out">Stock Out</option>
          <option value="stock_set">Stock Set</option>
          <option value="login">Login</option>
          <option value="change_password">Change Password</option>
          <option value="export_csv">Export CSV</option>
          <option value="backup">Backup</option>
          <option value="restore_backup">Restore Backup</option>
          <option value="telegram_invoice">Telegram Invoice</option>
          <option value="telegram_receipt">Telegram Receipt</option>
          <option value="telegram_debt_alert">Telegram Debt Alert</option>
        </select>
        <select v-model="entityType" class="form-select filter-select" @change="loadLogs(1)">
          <option value="">ប្រភេទទាំងអស់</option>
          <option value="invoice">Invoice</option>
          <option value="customer">Customer</option>
          <option value="product">Product</option>
          <option value="salesperson">Salesperson</option>
          <option value="admin">Admin</option>
          <option value="database">Database</option>
          <option value="settings">Settings</option>
        </select>
        <button class="btn btn-outline-secondary" type="button" @click="loadLogs(pagination.page)">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
      </div>
      <TableSkeleton v-if="loading" />
      <div v-else-if="!error && !logs.length" class="empty-state">
        <div class="empty-icon"><i class="bi bi-clock-history"></i></div>
        <h3>មិនមានកំណត់ត្រា</h3>
        <p>មិនទាន់មានសកម្មភាពត្រូវបង្ហាញតាមលក្ខខណ្ឌនេះទេ។</p>
      </div>
      <div v-else class="table-responsive">
        <table class="table invoice-table responsive-table mb-0">
          <thead><tr><th>ពេលវេលា</th><th>អ្នកប្រើ</th><th>សកម្មភាព</th><th>ប្រភេទ</th><th>ព័ត៌មាន</th></tr></thead>
          <tbody>
            <tr v-for="log in logs" :key="log.id">
              <td class="text-nowrap mobile-card-primary" data-label="ពេលវេលា">{{ formatTimestamp(log.createdAt) }}</td>
              <td data-label="អ្នកប្រើ"><strong>{{ log.actorUsername }}</strong></td>
              <td data-label="សកម្មភាព"><span class="audit-action">{{ log.action }}</span></td>
              <td data-label="ប្រភេទ">{{ log.entityType }}</td>
              <td data-label="ព័ត៌មាន">{{ log.summary || log.entityId || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <PaginationControls :pagination="pagination" @change="loadLogs" />
    </div>
  </section>
</template>
