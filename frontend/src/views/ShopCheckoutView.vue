<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { currentCustomer } from '../auth/customerSession.js'
import { shopApi } from '../api/shop.js'
import { cartItems, cartSubtotal, clearCart } from '../shop/cart.js'
import { showSuccessAlert, showToast, validateForm } from '../ui/feedback.js'

const router = useRouter()
const loading = ref(false)
const error = ref('')
const form = reactive({
  deliveryAddress: currentCustomer.value?.address || '',
  customerNote: '',
})
const money = (value) => `$${Number(value || 0).toFixed(2)}`
const itemCount = computed(() => cartItems.value.reduce((sum, item) => sum + item.quantity, 0))

const submitOrder = async (event) => {
  if (!(await validateForm(event.currentTarget))) return
  if (!cartItems.value.length) {
    await router.replace('/shop/cart')
    return
  }
  loading.value = true
  error.value = ''
  try {
    const { data } = await shopApi.createOrder({
      items: cartItems.value.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      deliveryAddress: form.deliveryAddress,
      customerNote: form.customerNote,
    })
    clearCart()
    await showSuccessAlert(
      `Your order ${data.orderNumber} was sent to our team. We will contact you to confirm it.`,
      'Order placed',
      { timer: 2200 },
    )
    await router.replace('/shop/orders')
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to place your order'
    showToast(error.value, 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="shop-page shop-checkout-page">
    <div class="page-heading">
      <div>
        <span class="eyebrow">CHECKOUT</span>
        <h1>Where should we deliver?</h1>
        <p>We will confirm the final delivery and payment details with you.</p>
      </div>
      <RouterLink class="btn btn-outline-primary" to="/shop/cart">Back to cart</RouterLink>
    </div>

    <div class="shop-checkout-layout">
      <form class="content-card p-4" novalidate @submit.prevent="submitOrder">
        <div v-if="error" class="alert alert-danger">{{ error }}</div>
        <div class="mb-3">
          <label class="form-label" for="deliveryAddress">Delivery address *</label>
          <textarea id="deliveryAddress" v-model.trim="form.deliveryAddress" class="form-control" rows="4" required></textarea>
        </div>
        <div class="mb-4">
          <label class="form-label" for="customerNote">Note for our team</label>
          <textarea id="customerNote" v-model.trim="form.customerNote" class="form-control" rows="3" maxlength="1000" placeholder="Preferred delivery time, colour request, or other details"></textarea>
        </div>
        <button class="btn btn-danger btn-lg w-100" type="submit" :disabled="loading">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
          {{ loading ? 'Placing order...' : 'Place order' }}
        </button>
      </form>
      <aside class="shop-order-summary">
        <span>ORDER SUMMARY</span>
        <div><span>Items</span><strong>{{ itemCount }}</strong></div>
        <div class="shop-summary-total"><span>Estimated total</span><strong>{{ money(cartSubtotal) }}</strong></div>
        <small>Product price is fixed when this order is placed. Delivery fees, if applicable, are confirmed by our team.</small>
      </aside>
    </div>
  </section>
</template>
