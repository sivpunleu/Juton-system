<script setup>
import { computed } from 'vue'
import { isCustomerAuthenticated } from '../auth/customerSession.js'
import {
  cartItems,
  cartSubtotal,
  removeFromCart,
  setCartQuantity,
} from '../shop/cart.js'

const money = (value) => `$${Number(value || 0).toFixed(2)}`
const checkoutTarget = computed(() =>
  isCustomerAuthenticated.value
    ? '/shop/checkout'
    : { name: 'shop-login', query: { redirect: '/shop/checkout' } },
)
</script>

<template>
  <section class="shop-page shop-cart-page">
    <div class="page-heading">
      <div>
        <span class="eyebrow">YOUR CART</span>
        <h1>Review your selected products</h1>
        <p>Prices and availability are checked again when you place your order.</p>
      </div>
      <RouterLink class="btn btn-outline-primary" to="/shop">
        <i class="bi bi-arrow-left me-1"></i> Continue shopping
      </RouterLink>
    </div>

    <div v-if="!cartItems.length" class="shop-empty-state">
      <i class="bi bi-bag-x"></i>
      <strong>Your cart is empty.</strong>
      <RouterLink class="btn btn-danger" to="/shop">Browse products</RouterLink>
    </div>

    <div v-else class="shop-cart-layout">
      <div class="shop-cart-list">
        <article v-for="item in cartItems" :key="item.productId" class="shop-cart-item">
          <div class="shop-product-icon"><i class="bi bi-paint-bucket"></i></div>
          <div class="shop-cart-item-copy">
            <strong>{{ item.name }}</strong>
            <small>{{ item.itemCode || 'Product' }}<template v-if="item.colorCode"> · Colour {{ item.colorCode }}</template></small>
            <span>{{ money(item.unitPrice) }} / {{ item.unit }}</span>
          </div>
          <input
            :value="item.quantity"
            class="form-control shop-quantity-input"
            type="number"
            min="1"
            max="1000"
            @change="setCartQuantity(item.productId, $event.target.value)"
          />
          <strong class="shop-line-total">{{ money(item.quantity * item.unitPrice) }}</strong>
          <button class="btn btn-outline-danger btn-sm" type="button" title="Remove" @click="removeFromCart(item.productId)">
            <i class="bi bi-trash3"></i>
          </button>
        </article>
      </div>
      <aside class="shop-order-summary">
        <span>ORDER SUMMARY</span>
        <div><span>Subtotal</span><strong>{{ money(cartSubtotal) }}</strong></div>
        <div><span>Delivery</span><strong>Confirmed by our team</strong></div>
        <hr />
        <div class="shop-summary-total"><span>Estimated total</span><strong>{{ money(cartSubtotal) }}</strong></div>
        <RouterLink class="btn btn-danger btn-lg w-100" :to="checkoutTarget">
          Proceed to checkout <i class="bi bi-arrow-right ms-1"></i>
        </RouterLink>
        <small>Payment and delivery will be confirmed after we review your order.</small>
      </aside>
    </div>
  </section>
</template>
