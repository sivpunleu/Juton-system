<script setup>
import { onMounted, ref } from 'vue'
import { shopApi } from '../api/shop.js'

const orders = ref([])
const loading = ref(true)
const error = ref('')
const money = (value) => `$${Number(value || 0).toFixed(2)}`
const statusLabel = (status) => ({
  pending: 'Awaiting review',
  confirmed: 'Confirmed',
  rejected: 'Not accepted',
  converted: 'Invoice created',
}[status] || status)

const loadOrders = async () => {
  loading.value = true
  try {
    const { data } = await shopApi.orders()
    orders.value = data.items || []
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to load your orders'
  } finally {
    loading.value = false
  }
}

onMounted(loadOrders)
</script>

<template>
  <section class="shop-page">
    <div class="page-heading">
      <div>
        <span class="eyebrow">MY ORDERS</span>
        <h1>Track your requests</h1>
        <p>Our team reviews each order before issuing an invoice.</p>
      </div>
      <RouterLink class="btn btn-danger" to="/shop">Shop products</RouterLink>
    </div>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-else-if="loading" class="shop-empty-state"><span class="spinner-border text-danger"></span> Loading orders...</div>
    <div v-else-if="!orders.length" class="shop-empty-state">
      <i class="bi bi-receipt"></i>
      <strong>You have not placed an order yet.</strong>
      <RouterLink class="btn btn-danger" to="/shop">Browse products</RouterLink>
    </div>
    <div v-else class="shop-orders-list">
      <article v-for="order in orders" :key="order.id" class="shop-order-card">
        <div class="shop-order-heading">
          <div>
            <strong>{{ order.orderNumber }}</strong>
            <small>{{ new Date(order.createdAt).toLocaleString() }}</small>
          </div>
          <span class="shop-order-status" :class="order.status">{{ statusLabel(order.status) }}</span>
        </div>
        <div class="shop-order-items">
          <div v-for="item in order.items" :key="item.id">
            <span>{{ item.description }} × {{ item.quantity }}</span>
            <strong>{{ money(item.total) }}</strong>
          </div>
        </div>
        <div v-if="order.customerNote" class="shop-order-note"><i class="bi bi-chat-left-text me-1"></i>{{ order.customerNote }}</div>
        <div class="shop-order-total"><span>Estimated total</span><strong>{{ money(order.grandTotal) }}</strong></div>
      </article>
    </div>
  </section>
</template>
