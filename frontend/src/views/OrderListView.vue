<script setup>
import { onMounted, reactive, ref } from 'vue'
import { adminOrderApi } from '../api/invoices.js'
import ErrorState from '../components/ErrorState.vue'
import PaginationControls from '../components/PaginationControls.vue'
import { requestConfirmation, showToast } from '../ui/feedback.js'

const orders = ref([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const status = ref('')
const pagination = reactive({ page: 1, limit: 10, total: 0, pages: 1 })
const money = (value) => `$${Number(value || 0).toFixed(2)}`
const statusLabel = (value) => ({ pending: 'Pending', confirmed: 'Confirmed', rejected: 'Rejected', converted: 'Invoice created' }[value] || value)

const loadOrders = async (page = pagination.page) => {
  loading.value = true
  error.value = ''
  try {
    const { data } = await adminOrderApi.list({ search: search.value, status: status.value, page, limit: pagination.limit })
    orders.value = data.items || []
    Object.assign(pagination, data.pagination)
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to load online orders'
  } finally {
    loading.value = false
  }
}

let searchTimer
const searchOrders = () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadOrders(1), 300)
}

const setStatus = async (order, nextStatus) => {
  const accepted = await requestConfirmation({
    title: nextStatus === 'confirmed' ? 'Confirm this order?' : 'Reject this order?',
    message: `${order.orderNumber} will be marked as ${nextStatus}.`,
    confirmLabel: nextStatus === 'confirmed' ? 'Confirm order' : 'Reject order',
    tone: nextStatus === 'rejected' ? 'danger' : 'default',
  })
  if (!accepted) return
  try {
    await adminOrderApi.updateStatus(order.id, { status: nextStatus })
    showToast(`Order ${nextStatus}`)
    await loadOrders()
  } catch (requestError) {
    showToast(requestError.response?.data?.message || 'Unable to update order', 'error')
  }
}

const convert = async (order) => {
  const accepted = await requestConfirmation({
    title: 'Create invoice from this order?',
    message: `This will deduct stock and create an unpaid invoice for ${order.orderNumber}.`,
    confirmLabel: 'Create invoice',
  })
  if (!accepted) return
  try {
    const { data } = await adminOrderApi.convert(order.id)
    showToast(`Invoice ${data.invoice.invoiceNumber} created`)
    await loadOrders()
  } catch (requestError) {
    showToast(requestError.response?.data?.message || 'Unable to create invoice', 'error')
  }
}

onMounted(loadOrders)
</script>

<template>
  <section class="container page-section">
    <div class="page-heading">
      <div>
        <span class="eyebrow">ONLINE SALES</span>
        <h1>Customer orders</h1>
        <p>Review customer requests, confirm stock, and turn confirmed orders into invoices.</p>
      </div>
      <RouterLink class="btn btn-outline-primary" to="/invoices"><i class="bi bi-receipt me-1"></i> Invoices</RouterLink>
    </div>

    <div class="content-card">
      <div class="card-toolbar flex-wrap">
        <div class="search-box">
          <i class="bi bi-search"></i>
          <input v-model="search" class="form-control" type="search" placeholder="Search order, customer, phone..." @input="searchOrders" />
        </div>
        <select v-model="status" class="form-select filter-select" @change="loadOrders(1)">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="rejected">Rejected</option>
          <option value="converted">Invoice created</option>
        </select>
      </div>
      <ErrorState v-if="error" title="Unable to load orders" :message="error" @retry="loadOrders" />
      <div v-else-if="loading" class="p-5 text-center text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Loading orders...</div>
      <div v-else-if="!orders.length" class="p-5 text-center text-muted">No customer orders found.</div>
      <div v-else class="table-responsive">
        <table class="table table-hover responsive-table mb-0">
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
          <tbody>
            <tr v-for="order in orders" :key="order.id">
              <td data-label="Order" class="mobile-card-primary"><strong>{{ order.orderNumber }}</strong><small class="d-block text-muted">{{ new Date(order.createdAt).toLocaleString() }}</small></td>
              <td data-label="Customer"><strong>{{ order.customer?.name }}</strong><small class="d-block text-muted">{{ order.customer?.phone }}</small></td>
              <td data-label="Items"><span v-for="item in order.items" :key="item.id" class="d-block">{{ item.description }} × {{ item.quantity }}</span></td>
              <td data-label="Total"><strong>{{ money(order.grandTotal) }}</strong></td>
              <td data-label="Status"><span class="badge" :class="`text-bg-${order.status === 'pending' ? 'warning' : order.status === 'rejected' ? 'danger' : order.status === 'converted' ? 'success' : 'primary'}`">{{ statusLabel(order.status) }}</span></td>
              <td data-label="Actions" class="mobile-card-actions text-end">
                <div class="d-flex justify-content-end flex-wrap gap-1">
                  <button v-if="order.status === 'pending'" class="btn btn-sm btn-primary" type="button" @click="setStatus(order, 'confirmed')">Confirm</button>
                  <button v-if="order.status === 'pending' || order.status === 'confirmed'" class="btn btn-sm btn-outline-danger" type="button" @click="setStatus(order, 'rejected')">Reject</button>
                  <button v-if="order.status === 'confirmed'" class="btn btn-sm btn-danger" type="button" @click="convert(order)">Create invoice</button>
                  <RouterLink v-if="order.invoiceId" class="btn btn-sm btn-outline-primary" :to="`/invoices/${order.invoiceId}`">View invoice</RouterLink>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PaginationControls v-if="pagination.pages > 1" :pagination="pagination" @change="loadOrders" />
    </div>
  </section>
</template>
