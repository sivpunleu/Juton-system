<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { insightApi } from '../api/invoices'
import { formatMoney } from '../utils/invoice'

const router = useRouter()
const query = ref('')
const loading = ref(false)
const open = ref(false)
const error = ref('')
const results = ref({
  invoices: [],
  customers: [],
  products: [],
})

const resultCount = computed(
  () =>
    results.value.invoices.length +
    results.value.customers.length +
    results.value.products.length,
)

let searchTimer
const search = () => {
  clearTimeout(searchTimer)
  const value = query.value.trim()
  if (value.length < 2) {
    open.value = false
    results.value = { invoices: [], customers: [], products: [] }
    return
  }

  searchTimer = window.setTimeout(async () => {
    loading.value = true
    error.value = ''
    open.value = true
    try {
      results.value = (await insightApi.search(value)).data
    } catch (requestError) {
      error.value =
        requestError.response?.data?.message || 'Search unavailable'
    } finally {
      loading.value = false
    }
  }, 260)
}

const navigate = async (target) => {
  open.value = false
  query.value = ''
  await router.push(target)
}

const closeLater = () => {
  window.setTimeout(() => {
    open.value = false
  }, 160)
}

onBeforeUnmount(() => clearTimeout(searchTimer))
</script>

<template>
  <div class="global-search" @focusout="closeLater">
    <i class="bi bi-search"></i>
    <input
      v-model="query"
      type="search"
      placeholder="ស្វែងរក Invoice, Customer, Product..."
      aria-label="Global search"
      @input="search"
      @focus="query.trim().length >= 2 && (open = true)"
      @keydown.esc="open = false"
    />
    <span v-if="loading" class="search-loading spinner-border"></span>

    <div v-if="open" class="global-search-results">
      <div v-if="error" class="search-message text-danger">{{ error }}</div>
      <div v-else-if="loading" class="search-message">កំពុងស្វែងរក...</div>
      <div v-else-if="!resultCount" class="search-message">
        រកមិនឃើញលទ្ធផល
      </div>
      <template v-else>
        <div v-if="results.invoices.length" class="search-group">
          <span>INVOICES</span>
          <button
            v-for="invoice in results.invoices"
            :key="invoice.id"
            type="button"
            @mousedown.prevent="navigate(`/invoices/${invoice.id}`)"
          >
            <i class="bi bi-receipt"></i>
            <span>
              <strong>{{ invoice.invoiceNumber }}</strong>
              <small>{{ invoice.customer?.name }}</small>
            </span>
            <b>{{ formatMoney(invoice.balanceDue) }}</b>
          </button>
        </div>

        <div v-if="results.customers.length" class="search-group">
          <span>CUSTOMERS</span>
          <button
            v-for="customer in results.customers"
            :key="customer.id"
            type="button"
            @mousedown.prevent="
              navigate(`/customers/${customer.id}/statement`)
            "
          >
            <i class="bi bi-person"></i>
            <span>
              <strong>{{ customer.name }}</strong>
              <small>{{ customer.phone || customer.address || '-' }}</small>
            </span>
          </button>
        </div>

        <div v-if="results.products.length" class="search-group">
          <span>PRODUCTS</span>
          <button
            v-for="product in results.products"
            :key="product.id"
            type="button"
            @mousedown.prevent="
              navigate({
                path: '/products',
                query: { search: product.itemCode || product.name },
              })
            "
          >
            <i class="bi bi-box-seam"></i>
            <span>
              <strong>{{ product.name }}</strong>
              <small>{{ product.itemCode || product.colorCode || '-' }}</small>
            </span>
            <b>{{ formatMoney(product.unitPrice) }}</b>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
