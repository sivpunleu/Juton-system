<script setup>
import { onMounted, ref } from 'vue'
import { shopApi } from '../api/shop.js'
import { addToCart } from '../shop/cart.js'
import { showToast } from '../ui/feedback.js'

const products = ref([])
const search = ref('')
const loading = ref(true)
const error = ref('')

const money = (value) => `$${Number(value || 0).toFixed(2)}`

const loadProducts = async () => {
  loading.value = true
  error.value = ''
  try {
    const { data } = await shopApi.products({ search: search.value, limit: 100 })
    products.value = data.items || []
  } catch (requestError) {
    products.value = []
    error.value = requestError.response?.data?.message || 'Unable to load products'
  } finally {
    loading.value = false
  }
}

let searchTimer
const searchProducts = () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadProducts, 250)
}

const addProduct = (product) => {
  if (!addToCart(product)) return
  showToast(`${product.name} added to cart`)
}

onMounted(loadProducts)
</script>

<template>
  <section class="shop-page">
    <div class="shop-hero">
      <div>
        <span class="eyebrow">MARVEL DECOR</span>
        <h1>Find the right paint for your space.</h1>
        <p>Browse available Jotun products, add them to your cart, and send your order directly to our team.</p>
      </div>
      <i class="bi bi-palette-fill"></i>
    </div>

    <div class="shop-toolbar">
      <div class="search-box">
        <i class="bi bi-search"></i>
        <input
          v-model="search"
          class="form-control"
          type="search"
          placeholder="Search product, item code, or colour..."
          @input="searchProducts"
        />
      </div>
      <RouterLink class="btn btn-outline-primary" to="/shop/cart">
        <i class="bi bi-bag me-1"></i> View cart
      </RouterLink>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-else-if="loading" class="shop-empty-state">
      <span class="spinner-border text-danger"></span>
      Loading products...
    </div>
    <div v-else-if="!products.length" class="shop-empty-state">
      <i class="bi bi-search"></i>
      No products matched your search.
    </div>
    <div v-else class="shop-product-grid">
      <article v-for="product in products" :key="product.id" class="shop-product-card">
        <div class="shop-product-icon"><i class="bi bi-paint-bucket"></i></div>
        <div class="shop-product-copy">
          <div class="d-flex justify-content-between gap-2 align-items-start">
            <h2>{{ product.name }}</h2>
            <span :class="product.inStock ? 'shop-stock available' : 'shop-stock'">
              {{ product.inStock ? 'In stock' : 'Out of stock' }}
            </span>
          </div>
          <p v-if="product.itemCode || product.colorCode">
            <span v-if="product.itemCode">{{ product.itemCode }}</span>
            <span v-if="product.itemCode && product.colorCode"> · </span>
            <span v-if="product.colorCode">Colour {{ product.colorCode }}</span>
          </p>
          <div class="shop-product-footer">
            <strong>{{ money(product.unitPrice) }} <small>/ {{ product.unit }}</small></strong>
            <button
              class="btn btn-danger"
              type="button"
              :disabled="!product.inStock"
              @click="addProduct(product)"
            >
              <i class="bi bi-plus-lg me-1"></i> Add
            </button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
