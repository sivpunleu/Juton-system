<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  clearCustomerSession,
  currentCustomer,
  isCustomerAuthenticated,
} from '../auth/customerSession.js'
import { cartCount } from '../shop/cart.js'
import logo from '../assets/logo-marvel.png'
import jotunLogo from '../assets/jotun.jpg'

const router = useRouter()
const customerName = computed(() =>
  currentCustomer.value?.name || currentCustomer.value?.username || 'Customer',
)

const logout = async () => {
  clearCustomerSession()
  await router.push('/shop')
}
</script>

<template>
  <div class="shop-shell">
    <header class="shop-header d-print-none">
      <RouterLink class="shop-brand" to="/shop" aria-label="Open shop">
        <img :src="logo" alt="Marvel Decor" />
        <span>
          <strong>MARVEL DECOR</strong>
          <small>ONLINE SHOP</small>
        </span>
        <img class="shop-jotun-logo" :src="jotunLogo" alt="Jotun" />
      </RouterLink>
      <nav class="shop-nav">
        <RouterLink to="/shop">Products</RouterLink>
        <RouterLink to="/shop/orders" v-if="isCustomerAuthenticated">My orders</RouterLink>
        <RouterLink class="shop-cart-link" to="/shop/cart">
          <i class="bi bi-bag"></i>
          Cart <span>{{ cartCount }}</span>
        </RouterLink>
        <RouterLink v-if="!isCustomerAuthenticated" class="btn btn-danger btn-sm" to="/shop/login">
          Login
        </RouterLink>
        <div v-else class="shop-customer-menu">
          <span><i class="bi bi-person-circle me-1"></i>{{ customerName }}</span>
          <button type="button" @click="logout">Logout</button>
        </div>
      </nav>
    </header>
    <RouterView />
  </div>
</template>
