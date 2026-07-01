<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter,
} from 'vue-router'
import {
  customerApi,
  invoiceApi,
  productApi,
  salespersonApi,
} from '../api/invoices'
import ContentSkeleton from '../components/ContentSkeleton.vue'
import { formatMoney, toDateInput } from '../utils/invoice'
import {
  requestConfirmation,
  showToast,
  validateForm,
} from '../ui/feedback'

const route = useRoute()
const router = useRouter()
const saving = ref(false)
const loading = ref(false)
const error = ref('')
const customers = ref([])
const products = ref([])
const salespeople = ref([])
const isEditing = computed(() => Boolean(route.params.id))
const duplicateId = computed(() => String(route.query.duplicate || ''))
const duplicatedFrom = ref('')
const formReady = ref(false)
const savedSnapshot = ref('')
const allowNavigation = ref(false)
const originalItems = ref([])
const originalStockWillDeduct = ref(false)

const addDays = (dateValue, days) => {
  const date = new Date(dateValue)
  date.setDate(date.getDate() + days)
  return toDateInput(date)
}

const newItem = () => ({
  productId: '',
  description: '',
  itemCode: '',
  colorCode: '',
  quantity: 1,
  unit: 'ធុង',
  unitPrice: 0,
  discount: 0,
})

const unitOptions = [
  'ធុង',
  'លីត្រ',
  'បាវ',
  'ដុំ',
  'ប្រអប់',
  'កំប៉ុង',
  'ឈុត',
  'ម៉ែត្រ',
  'គីឡូក្រាម',
  'ផ្សេងៗ',
]

const defaultForm = () => ({
  invoiceNumber: '',
  invoiceDate: toDateInput(),
  dueDate: addDays(new Date(), 7),
  customerId: '',
  customer: {
    name: '',
    phone: '',
    address: '',
  },
  salesChannel: 'store',
  salespersonId: '',
  salesperson: {
    name: '',
    phone: '',
  },
  items: [newItem()],
  discount: 0,
  taxRate: 0,
  deliveryFee: 0,
  depositRate: 0,
  status: 'unpaid',
  notes: '',
})
const form = reactive(defaultForm())

const formSnapshot = () => JSON.stringify(form)
const hasUnsavedChanges = computed(
  () =>
    formReady.value &&
    formSnapshot() !== savedSnapshot.value,
)

const resetInvoiceForm = () => {
  Object.assign(form, defaultForm())
  duplicatedFrom.value = ''
  formReady.value = false
  savedSnapshot.value = ''
  allowNavigation.value = false
  originalItems.value = []
  originalStockWillDeduct.value = false
}

const lineTotal = (item) =>
  Math.max(
    0,
    Number(item.quantity || 0) * Number(item.unitPrice || 0) -
      Number(item.discount || 0),
  )

const subtotal = computed(() =>
  form.items.reduce((sum, item) => sum + lineTotal(item), 0),
)
const taxableAmount = computed(() =>
  Math.max(0, subtotal.value - Number(form.discount || 0)),
)
const taxAmount = computed(
  () => taxableAmount.value * (Number(form.taxRate || 0) / 100),
)
const grandTotal = computed(
  () => taxableAmount.value + taxAmount.value + Number(form.deliveryFee || 0),
)
const depositAmount = computed(
  () => grandTotal.value * (Number(form.depositRate || 0) / 100),
)
const balanceDue = computed(() =>
  Math.max(0, grandTotal.value - depositAmount.value),
)
const stockWillDeduct = computed(() =>
  ['unpaid', 'partially_paid', 'paid'].includes(form.status),
)

const productForItem = (item) =>
  products.value.find(
    (record) => String(record.id) === String(item.productId),
  )

const quantityForProduct = (items, productId) =>
  items.reduce(
    (sum, item) =>
      String(item.productId || '') === String(productId)
        ? sum + Number(item.quantity || 0)
        : sum,
    0,
  )

const stockStatusForItem = (item) => {
  const product = productForItem(item)
  if (!product) {
    return { hasProduct: false, insufficient: false, message: '' }
  }
  const productId = String(item.productId || '')
  const reservedForCurrentInvoice =
    isEditing.value && originalStockWillDeduct.value
      ? quantityForProduct(originalItems.value, productId)
      : 0
  const available = Number(product.stockQuantity || 0) + reservedForCurrentInvoice
  const requested = quantityForProduct(form.items, productId)
  const unit = product.unit || item.unit || ''
  const insufficient =
    stockWillDeduct.value && Number.isFinite(requested) && requested > available

  return {
    hasProduct: true,
    insufficient,
    message: insufficient
      ? `Only ${available} ${unit} available; selected ${requested} ${unit}.`
      : `Stock available: ${available} ${unit}`,
  }
}

const loadLookups = async () => {
  const [customerResponse, productResponse, salespersonResponse] =
    await Promise.all([
    customerApi.list({ limit: 100 }),
    productApi.list({ limit: 100 }),
    salespersonApi
      .list({ limit: 100 })
      .catch(() => ({ data: { items: [] } })),
  ])
  customers.value = customerResponse.data.items || []
  products.value = productResponse.data.items || []
  salespeople.value = salespersonResponse.data.items || []
}

const applyCustomer = () => {
  const customer = customers.value.find(
    (item) => String(item.id) === String(form.customerId),
  )
  if (!customer) return
  form.customer = {
    name: customer.name || '',
    phone: customer.phone || '',
    address: customer.address || '',
  }
}

const applyProduct = (item) => {
  const product = products.value.find(
    (record) => String(record.id) === String(item.productId),
  )
  if (!product) return
  Object.assign(item, {
    description: product.name || '',
    itemCode: product.itemCode || '',
    colorCode: product.colorCode || '',
    unit: product.unit || 'ធុង',
    unitPrice: Number(product.unitPrice || 0),
  })
}

const changeSalesChannel = () => {
  if (form.salesChannel === 'store') {
    form.salespersonId = ''
    form.salesperson = { name: '', phone: '' }
  }
}

const applySalesperson = () => {
  const salesperson = salespeople.value.find(
    (item) => String(item.id) === String(form.salespersonId),
  )
  if (!salesperson) return
  form.salesperson = {
    name: salesperson.name || '',
    phone: salesperson.phone || '',
  }
}

const addItem = () => form.items.push(newItem())
const removeItem = async (index) => {
  if (form.items.length <= 1) return
  const itemName = form.items[index]?.description || `ផលិតផលទី ${index + 1}`
  const confirmed = await requestConfirmation({
    title: 'លុបផលិតផលនេះ?',
    message: `"${itemName}" នឹងត្រូវដកចេញពីវិក្កយបត្រនេះ។`,
    confirmLabel: 'លុប',
    cancelLabel: 'បោះបង់',
    tone: 'danger',
  })
  if (confirmed) form.items.splice(index, 1)
}

const loadInvoice = async () => {
  const sourceId = isEditing.value ? route.params.id : duplicateId.value
  if (!sourceId) return
  const { data } = await invoiceApi.get(sourceId)
  const loadedStatus =
    data.status ||
    (data.paymentStatus === 'partial'
      ? 'partially_paid'
      : data.paymentStatus || 'unpaid')
  originalItems.value = isEditing.value && Array.isArray(data.items)
    ? data.items.map((item) => ({
        productId: item.productId || '',
        quantity: Number(item.quantity || 0),
      }))
    : []
  originalStockWillDeduct.value =
    isEditing.value &&
    ['unpaid', 'partially_paid', 'paid'].includes(loadedStatus)
  Object.assign(form, {
    invoiceNumber: isEditing.value ? data.invoiceNumber : '',
    invoiceDate: isEditing.value ? toDateInput(data.invoiceDate) : toDateInput(),
    dueDate: isEditing.value
      ? toDateInput(data.dueDate)
      : addDays(new Date(), 7),
    customerId: data.customerId || '',
    customer: { ...data.customer },
    salesChannel: data.salesChannel || 'store',
    salespersonId: data.salespersonId || '',
    salesperson: {
      name: data.salesperson?.name || '',
      phone: data.salesperson?.phone || '',
    },
    discount: Number(data.discount || 0),
    taxRate: Number(data.taxRate || 0),
    deliveryFee: Number(data.deliveryFee || 0),
    depositRate: Number(data.depositRate || 0),
    status: isEditing.value ? loadedStatus : 'unpaid',
    notes: data.notes || '',
    items: Array.isArray(data.items)
      ? data.items.map((item) => ({
          productId: item.productId || '',
          description: item.description,
          itemCode: item.itemCode || '',
          colorCode: item.colorCode || '',
          quantity: item.quantity,
          unit: item.unit || 'ធុង',
          unitPrice: item.unitPrice,
          discount: item.discount || 0,
        }))
      : [newItem()],
  })
  if (!isEditing.value) duplicatedFrom.value = data.invoiceNumber || ''
}

const initialize = async () => {
  loading.value = true
  error.value = ''
  try {
    await Promise.all([loadLookups(), loadInvoice()])
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចទាញយកទិន្នន័យបានទេ'
  } finally {
    loading.value = false
    formReady.value = !error.value
    savedSnapshot.value = formSnapshot()
  }
}

const submitForm = async (event) => {
  const dueDateInvalid =
    form.invoiceDate &&
    form.dueDate &&
    new Date(form.dueDate) < new Date(form.invoiceDate)
  const invalidDiscount = form.items.some(
    (item) =>
      Number(item.discount || 0) >
      Number(item.quantity || 0) * Number(item.unitPrice || 0),
  )
  const customMessage = dueDateInvalid
    ? 'ថ្ងៃកំណត់បង់ប្រាក់ មិនអាចមុនកាលបរិច្ឆេទវិក្កយបត្របានទេ។'
    : invalidDiscount
      ? 'បញ្ចុះតម្លៃផលិតផល មិនអាចលើសតម្លៃសរុបរបស់ផលិតផលបានទេ។'
      : ''
  if (
    !(await validateForm(event?.currentTarget, {
      customMessage,
    }))
  ) return

  saving.value = true
  error.value = ''
  try {
    const payload = JSON.parse(JSON.stringify(form))
    const response = isEditing.value
      ? await invoiceApi.update(route.params.id, payload)
      : await invoiceApi.create(payload)
    showToast(
      isEditing.value
        ? 'កែប្រែវិក្កយបត្របានជោគជ័យ'
        : 'បង្កើតវិក្កយបត្របានជោគជ័យ',
    )
    allowNavigation.value = true
    savedSnapshot.value = formSnapshot()
    await router.push({
      name: 'invoice-preview',
      params: { id: response.data.id },
    })
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចរក្សាទុកវិក្កយបត្របានទេ'
    showToast(error.value, 'error')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } finally {
    saving.value = false
  }
}

const confirmLeave = () =>
  requestConfirmation({
    title: 'ចាកចេញដោយមិនរក្សាទុក?',
    message:
      'ទិន្នន័យដែលអ្នកបានកែប្រែនៅលើវិក្កយបត្រនេះមិនទាន់បានរក្សាទុកទេ។',
    confirmLabel: 'ចាកចេញ',
    cancelLabel: 'បន្តកែប្រែ',
    tone: 'danger',
  })

onBeforeRouteLeave(async () => {
  if (allowNavigation.value || !hasUnsavedChanges.value) return true
  return confirmLeave()
})

onBeforeRouteUpdate(async () => {
  if (allowNavigation.value || !hasUnsavedChanges.value) return true
  return confirmLeave()
})

const handleBeforeUnload = (event) => {
  if (!hasUnsavedChanges.value || allowNavigation.value) return
  event.preventDefault()
  event.returnValue = ''
}

watch(
  () => route.fullPath,
  () => {
    if (!['invoice-create', 'invoice-edit'].includes(route.name)) return
    resetInvoiceForm()
    initialize()
  },
)

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  initialize()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <section class="container page-section">
    <div class="page-heading compact">
      <div>
        <span class="eyebrow">{{ isEditing ? 'EDIT INVOICE' : 'NEW INVOICE' }}</span>
        <h1>{{ isEditing ? 'កែប្រែវិក្កយបត្រ' : 'បង្កើតវិក្កយបត្រថ្មី' }}</h1>
        <p>ជ្រើសអតិថិជន និងទំនិញដែលបានរក្សាទុក ឬបញ្ចូលថ្មីដោយដៃ។</p>
      </div>
      <RouterLink class="btn btn-outline-secondary" to="/invoices">
        <i class="bi bi-arrow-left me-1"></i> ត្រឡប់ក្រោយ
      </RouterLink>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div
      v-if="duplicatedFrom && !isEditing"
      class="duplicate-invoice-notice"
    >
      <i class="bi bi-copy"></i>
      <span>
        ចម្លងពីវិក្កយបត្រ <strong>{{ duplicatedFrom }}</strong>។ លេខវិក្កយបត្រថ្មី
        នឹងបង្កើតដោយស្វ័យប្រវត្តិពេលរក្សាទុក។
      </span>
    </div>
    <ContentSkeleton v-if="loading" :cards="3" />

    <form v-else novalidate @submit.prevent="submitForm">
      <div class="row g-4">
        <div class="col-lg-8">
          <div class="content-card form-card mb-4">
            <div class="section-title">
              <span class="section-number">01</span>
              <div><h2>ព័ត៌មានវិក្កយបត្រ</h2><p>លេខវិក្កយបត្របង្កើតដោយស្វ័យប្រវត្តិ និងមិនស្ទួន។</p></div>
            </div>
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">លេខវិក្កយបត្រ</label>
                <input
                  class="form-control"
                  :value="isEditing ? form.invoiceNumber : 'បង្កើតស្វ័យប្រវត្តិពេលរក្សាទុក'"
                  disabled
                />
              </div>
              <div class="col-md-3">
                <label class="form-label">កាលបរិច្ឆេទ *</label>
                <input v-model="form.invoiceDate" class="form-control" type="date" required />
              </div>
              <div class="col-md-3">
                <label class="form-label">ថ្ងៃកំណត់ *</label>
                <input v-model="form.dueDate" class="form-control" type="date" required />
              </div>
              <div class="col-md-6 sales-source-field">
                <label class="form-label">ប្រភពការលក់ *</label>
                <select
                  v-model="form.salesChannel"
                  class="form-select sales-source-control"
                  required
                  @change="changeSalesChannel"
                >
                  <option value="store">ទិញនៅហាងផ្ទាល់</option>
                  <option value="salesperson">Sale ជាអ្នកលក់</option>
                </select>
              </div>
              <div
                v-if="form.salesChannel === 'salesperson'"
                class="col-md-6 sales-source-field"
              >
                <label class="form-label">ឈ្មោះ Sale *</label>
                <select
                  v-model="form.salespersonId"
                  class="form-select sales-source-control"
                  required
                  @change="applySalesperson"
                >
                  <option value="">-- ជ្រើសរើស Sale --</option>
                  <option
                    v-if="
                      form.salespersonId &&
                      !salespeople.some(
                        (item) => String(item.id) === String(form.salespersonId),
                      )
                    "
                    :value="form.salespersonId"
                  >
                    {{ form.salesperson.name }}
                  </option>
                  <option
                    v-for="salesperson in salespeople"
                    :key="salesperson.id"
                    :value="salesperson.id"
                  >
                    {{ salesperson.name }}
                    {{ salesperson.phone ? `· ${salesperson.phone}` : '' }}
                  </option>
                </select>
                <small class="form-text text-secondary">
                  មិនឃើញឈ្មោះ?
                  <RouterLink to="/salespeople">បន្ថែម Sale ថ្មី</RouterLink>
                </small>
              </div>
              <div v-else class="col-md-6 sales-source-preview-field">
                <div class="sales-source-preview">
                  <i class="bi bi-shop"></i>
                  <span>
                    <strong>ទិញនៅហាងផ្ទាល់</strong>
                    <small>Invoice នេះនឹងត្រូវរាប់ជាការលក់នៅហាង។</small>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="content-card form-card mb-4">
            <div class="section-title">
              <span class="section-number">02</span>
              <div><h2>ព័ត៌មានអតិថិជន</h2><p>ជ្រើសពីបញ្ជី ដើម្បីបំពេញទិន្នន័យដោយស្វ័យប្រវត្តិ។</p></div>
            </div>
            <div class="row g-3">
              <div class="col-12">
                <label class="form-label">ជ្រើសអតិថិជនដែលបានរក្សាទុក</label>
                <select v-model="form.customerId" class="form-select" @change="applyCustomer">
                  <option value="">-- បញ្ចូលអតិថិជនថ្មីដោយដៃ --</option>
                  <option v-for="customer in customers" :key="customer.id" :value="customer.id">
                    {{ customer.name }} {{ customer.phone ? `· ${customer.phone}` : '' }}
                  </option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">ឈ្មោះអតិថិជន *</label>
                <input v-model.trim="form.customer.name" class="form-control" required />
              </div>
              <div class="col-md-6">
                <label class="form-label">លេខទូរស័ព្ទ</label>
                <input
                  v-model.trim="form.customer.phone"
                  class="form-control"
                  type="tel"
                  pattern="[0-9+() -]{7,20}"
                  title="សូមបញ្ចូលលេខទូរស័ព្ទត្រឹមត្រូវ"
                />
              </div>
              <div class="col-12">
                <label class="form-label">អាសយដ្ឋាន</label>
                <textarea v-model.trim="form.customer.address" class="form-control" rows="2"></textarea>
              </div>
            </div>
          </div>

          <div class="content-card form-card mb-4">
            <div class="section-title">
              <span class="section-number">03</span>
              <div><h2>ផលិតផល</h2><p>ជ្រើសពី catalogue ឬបញ្ចូលទំនិញថ្មីដោយដៃ។</p></div>
            </div>
            <div class="items-list">
              <div v-for="(item, index) in form.items" :key="index" class="item-row">
                <div class="item-row-heading">
                  <strong>ផលិតផលទី {{ index + 1 }}</strong>
                  <button class="btn btn-sm btn-link text-danger" type="button" :disabled="form.items.length === 1" @click="removeItem(index)">
                    <i class="bi bi-trash3 me-1"></i> លុប
                  </button>
                </div>
                <div class="row g-3">
                  <div class="col-12">
                    <label class="form-label">ជ្រើសពី Product Catalogue</label>
                    <select v-model="item.productId" class="form-select" @change="applyProduct(item)">
                      <option value="">-- បញ្ចូលដោយដៃ --</option>
                      <option v-for="product in products" :key="product.id" :value="product.id">
                        {{ product.name }} · {{ product.itemCode || 'No code' }} · {{ formatMoney(product.unitPrice) }}/{{ product.unit }}
                      </option>
                    </select>
                    <small
                      v-if="stockStatusForItem(item).hasProduct"
                      class="stock-helper"
                      :class="{ 'stock-helper-danger': stockStatusForItem(item).insufficient }"
                    >
                      {{ stockStatusForItem(item).message }}
                    </small>
                  </div>
                  <div class="col-md-5">
                    <label class="form-label">ឈ្មោះផលិតផល *</label>
                    <input v-model.trim="item.description" class="form-control" required />
                  </div>
                  <div class="col-md-2">
                    <label class="form-label">Color Code</label>
                    <input v-model.trim="item.colorCode" class="form-control" />
                  </div>
                  <div class="col-md-2">
                    <label class="form-label">បរិមាណ *</label>
                    <input
                      v-model.number="item.quantity"
                      class="form-control"
                      :class="{ 'is-invalid': stockStatusForItem(item).insufficient }"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                    />
                    <small
                      v-if="stockStatusForItem(item).insufficient"
                      class="field-validation-message"
                    >
                      Quantity exceeds current stock.
                    </small>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label">ឯកតា *</label>
                    <select v-model="item.unit" class="form-select" required>
                      <option v-for="option in unitOptions" :key="option" :value="option">{{ option }}</option>
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">តម្លៃរាយ *</label>
                    <div class="input-group"><span class="input-group-text">$</span><input v-model.number="item.unitPrice" class="form-control" type="number" min="0" step="0.01" required /></div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">បញ្ចុះតម្លៃ</label>
                    <div class="input-group"><span class="input-group-text">$</span><input v-model.number="item.discount" class="form-control" type="number" min="0" :max="Number(item.quantity || 0) * Number(item.unitPrice || 0)" step="0.01" /></div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">សរុប</label>
                    <div class="line-total">{{ formatMoney(lineTotal(item)) }}</div>
                  </div>
                </div>
              </div>
            </div>
            <button class="btn btn-outline-primary" type="button" @click="addItem">
              <i class="bi bi-plus-lg me-1"></i> បន្ថែមផលិតផល
            </button>
          </div>

          <div class="content-card form-card">
            <div class="section-title">
              <span class="section-number">04</span>
              <div><h2>កំណត់ចំណាំ</h2><p>លក្ខខណ្ឌបង់ប្រាក់ ឬព័ត៌មានបន្ថែម។</p></div>
            </div>
            <textarea v-model.trim="form.notes" class="form-control" rows="4"></textarea>
          </div>
        </div>

        <div class="col-lg-4">
          <div class="content-card form-card totals-card">
            <h2>សេចក្ដីសង្ខេប</h2>
            <div class="mb-3">
              <label class="form-label">ស្ថានភាព</label>
              <select v-model="form.status" class="form-select">
                <option value="draft">Draft</option>
                <option value="unpaid">Unpaid</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <div
                class="invoice-status-note"
                :class="{ 'invoice-status-note-muted': !stockWillDeduct }"
              >
                <i :class="stockWillDeduct ? 'bi bi-box-arrow-down' : 'bi bi-pencil-square'"></i>
                <span>
                  {{
                    stockWillDeduct
                      ? 'Stock will be deducted when this invoice is saved.'
                      : 'Draft or cancelled invoices do not deduct stock.'
                  }}
                </span>
              </div>
              <small class="text-secondary">Paid/Partially Paid នឹងកែដោយស្វ័យប្រវត្តិតាម Payment History។</small>
            </div>
            <div class="mb-3">
              <label class="form-label">បញ្ចុះតម្លៃវិក្កយបត្រ</label>
              <div class="input-group"><span class="input-group-text">$</span><input v-model.number="form.discount" class="form-control" type="number" min="0" :max="subtotal" step="0.01" /></div>
            </div>
            <div class="mb-3">
              <label class="form-label">ពន្ធ</label>
              <div class="input-group"><input v-model.number="form.taxRate" class="form-control" type="number" min="0" max="100" step="0.01" /><span class="input-group-text">%</span></div>
            </div>
            <div class="mb-3">
              <label class="form-label">ថ្លៃដឹកជញ្ជូន</label>
              <div class="input-group"><span class="input-group-text">$</span><input v-model.number="form.deliveryFee" class="form-control" type="number" min="0" step="0.01" /></div>
            </div>
            <div class="mb-4">
              <label class="form-label">ប្រាក់កក់ដែលបានបង់</label>
              <div class="input-group"><input v-model.number="form.depositRate" class="form-control" type="number" min="0" max="100" step="0.01" /><span class="input-group-text">%</span></div>
            </div>

            <div class="totals-breakdown">
              <div><span>សរុបរង</span><strong>{{ formatMoney(subtotal) }}</strong></div>
              <div><span>បញ្ចុះតម្លៃ</span><strong>-{{ formatMoney(form.discount) }}</strong></div>
              <div><span>ពន្ធ</span><strong>{{ formatMoney(taxAmount) }}</strong></div>
              <div><span>ដឹកជញ្ជូន</span><strong>{{ formatMoney(form.deliveryFee) }}</strong></div>
              <div><span>ប្រាក់កក់</span><strong>-{{ formatMoney(depositAmount) }}</strong></div>
              <div class="grand-total"><span>ប្រាក់នៅសល់</span><strong>{{ formatMoney(balanceDue) }}</strong></div>
            </div>

            <button class="btn btn-danger btn-lg w-100 mt-4" type="submit" :disabled="saving">
              <span v-if="saving" class="spinner-border spinner-border-sm me-2"></span>
              <i v-else class="bi bi-check2-circle me-2"></i>
              {{ saving ? 'កំពុងរក្សាទុក...' : 'រក្សាទុកវិក្កយបត្រ' }}
            </button>
          </div>
        </div>
      </div>
    </form>
  </section>
</template>
