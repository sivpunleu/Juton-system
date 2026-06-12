<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { customerApi } from '../api/invoices'
import ErrorState from '../components/ErrorState.vue'
import TableSkeleton from '../components/TableSkeleton.vue'
import {
  formatDate,
  formatMoney,
  invoiceStatusLabels,
  resolveInvoiceStatus,
} from '../utils/invoice'
import { validateForm } from '../ui/feedback'

const route = useRoute()
const statement = ref(null)
const loading = ref(true)
const error = ref('')
const filters = reactive({ from: '', to: '' })
const printStatement = () => window.print()
const payments = computed(() =>
  (statement.value?.invoices || [])
    .flatMap((invoice) => [
      ...(Number(invoice.depositAmount || 0) > 0
        ? [
            {
              id: `deposit-${invoice.id}`,
              paidAt: invoice.invoiceDate,
              amount: invoice.depositAmount,
              receivedBy: invoice.createdBy || 'Deposit',
              note: 'Invoice deposit',
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
            },
          ]
        : []),
      ...(invoice.payments || []).map((payment) => ({
        ...payment,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      })),
    ])
    .sort((left, right) => new Date(right.paidAt) - new Date(left.paidAt)),
)

const load = async () => {
  loading.value = true
  error.value = ''
  try {
    statement.value = (
      await customerApi.statement(route.params.id, filters)
    ).data
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to load statement'
  } finally {
    loading.value = false
  }
}

const applyFilters = async (event) => {
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
  await load()
}

onMounted(load)
</script>

<template>
  <section class="container page-section statement-page">
    <div class="preview-actions d-print-none">
      <RouterLink class="btn btn-outline-secondary" to="/customers">
        <i class="bi bi-arrow-left me-1"></i> អតិថិជន
      </RouterLink>
      <button class="btn btn-danger" type="button" @click="printStatement">
        <i class="bi bi-printer me-1"></i> Print Statement
      </button>
    </div>

    <ErrorState
      v-if="error && !statement"
      :message="error"
      :retrying="loading"
      @retry="load"
    />
    <div v-else-if="error" class="alert alert-danger">{{ error }}</div>
    <TableSkeleton v-if="loading" />

    <article v-else-if="statement" class="statement-paper">
      <header class="statement-header">
        <div>
          <span class="eyebrow">CUSTOMER STATEMENT</span>
          <h1>{{ statement.customer.name }}</h1>
          <p>
            {{ statement.customer.phone || '-' }} ·
            {{ statement.customer.address || '-' }}
          </p>
        </div>
        <div class="statement-date">
          <strong>{{ formatDate(new Date()) }}</strong>
          <span>Statement Date</span>
        </div>
      </header>

      <form
        class="statement-filters d-print-none"
        novalidate
        @submit.prevent="applyFilters"
      >
        <label class="visually-hidden" for="statementFrom">From</label>
        <input
          id="statementFrom"
          v-model="filters.from"
          class="form-control"
          type="date"
        />
        <label class="visually-hidden" for="statementTo">To</label>
        <input
          id="statementTo"
          v-model="filters.to"
          class="form-control"
          type="date"
        />
        <button class="btn btn-outline-primary" type="submit">Filter</button>
      </form>

      <div class="statement-summary">
        <div><span>Invoiced</span><strong>{{ formatMoney(statement.totals.invoiced) }}</strong></div>
        <div><span>Paid</span><strong>{{ formatMoney(statement.totals.paid) }}</strong></div>
        <div><span>Balance</span><strong>{{ formatMoney(statement.totals.balance) }}</strong></div>
      </div>

      <div class="table-responsive">
        <table class="table invoice-table responsive-table statement-table mb-0">
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice</th>
              <th>Sales Source</th>
              <th>Status</th>
              <th class="text-end">Total</th>
              <th class="text-end">Paid</th>
              <th class="text-end">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="invoice in statement.invoices" :key="invoice.id">
              <td class="mobile-card-primary" data-label="Date">
                {{ formatDate(invoice.invoiceDate) }}
              </td>
              <td data-label="Invoice">
                <RouterLink
                  class="invoice-number d-print-none"
                  :to="`/invoices/${invoice.id}`"
                >
                  {{ invoice.invoiceNumber }}
                </RouterLink>
                <span class="d-none d-print-inline">{{ invoice.invoiceNumber }}</span>
              </td>
              <td data-label="Sales Source">
                {{
                  invoice.salesChannel === 'salesperson'
                    ? invoice.salesperson?.name || 'Sale'
                    : 'នៅហាង'
                }}
              </td>
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
              <td class="text-end" data-label="Total">
                {{ formatMoney(invoice.grandTotal) }}
              </td>
              <td class="text-end" data-label="Paid">
                {{ formatMoney(invoice.paidAmount) }}
              </td>
              <td class="text-end fw-bold" data-label="Balance">
                {{ formatMoney(invoice.balanceDue) }}
              </td>
            </tr>
            <tr v-if="!statement.invoices.length">
              <td colspan="7" class="text-center py-4 text-secondary">
                No invoices found
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <section class="statement-payments">
        <div class="card-toolbar">
          <div>
            <h2 class="panel-title mb-1">Payment History</h2>
            <small class="text-secondary">
              ថ្ងៃបង់ប្រាក់ ចំនួនប្រាក់ និងអ្នកទទួល
            </small>
          </div>
          <span class="role-badge">{{ payments.length }} payments</span>
        </div>
        <div class="table-responsive">
          <table class="table invoice-table responsive-table mb-0">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Received By</th>
                <th>Note</th>
                <th class="text-end">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="payment in payments" :key="payment.id">
                <td class="mobile-card-primary" data-label="Date">
                  {{ formatDate(payment.paidAt) }}
                </td>
                <td data-label="Invoice">{{ payment.invoiceNumber }}</td>
                <td data-label="Received By">{{ payment.receivedBy }}</td>
                <td data-label="Note">{{ payment.note || '-' }}</td>
                <td class="text-end fw-bold" data-label="Amount">
                  {{ formatMoney(payment.amount) }}
                </td>
              </tr>
              <tr v-if="!payments.length">
                <td colspan="5" class="text-center py-4 text-secondary">
                  No payment history
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </article>
  </section>
</template>
