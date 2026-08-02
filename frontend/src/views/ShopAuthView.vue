<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { shopApi } from '../api/shop.js'
import { setCustomerSession } from '../auth/customerSession.js'
import { showToast, validateForm } from '../ui/feedback.js'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const error = ref('')
const showPassword = ref(false)
const form = reactive({
  name: '',
  phone: '',
  address: '',
  username: '',
  password: '',
  confirmPassword: '',
})
const isRegister = computed(() => route.name === 'shop-register')
const title = computed(() => (isRegister.value ? 'Create your account' : 'Welcome back'))

watch(isRegister, () => {
  error.value = ''
})

const submit = async (event) => {
  if (!(await validateForm(event.currentTarget))) return
  if (isRegister.value && form.password !== form.confirmPassword) {
    error.value = 'Password confirmation does not match'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const response = isRegister.value
      ? await shopApi.register({
          name: form.name,
          phone: form.phone,
          address: form.address,
          username: form.username,
          password: form.password,
        })
      : await shopApi.login({ username: form.username, password: form.password })
    setCustomerSession(response.data)
    showToast(isRegister.value ? 'Your account is ready' : 'Login successful')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/shop'
    await router.replace(redirect)
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to continue'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="shop-auth-page">
    <div class="shop-auth-card">
      <span class="eyebrow">CUSTOMER ACCESS</span>
      <h1>{{ title }}</h1>
      <p>{{ isRegister ? 'Register once to place and track your orders.' : 'Login to view orders and complete checkout.' }}</p>
      <div v-if="error" class="alert alert-danger">{{ error }}</div>

      <form novalidate @submit.prevent="submit">
        <template v-if="isRegister">
          <div class="mb-3">
            <label class="form-label" for="customerName">Full name *</label>
            <input id="customerName" v-model.trim="form.name" class="form-control" required maxlength="191" autocomplete="name" />
          </div>
          <div class="mb-3">
            <label class="form-label" for="customerPhone">Phone number *</label>
            <input id="customerPhone" v-model.trim="form.phone" class="form-control" type="tel" required maxlength="50" autocomplete="tel" />
          </div>
          <div class="mb-3">
            <label class="form-label" for="customerAddress">Default delivery address</label>
            <textarea id="customerAddress" v-model.trim="form.address" class="form-control" rows="2" maxlength="2000" autocomplete="street-address"></textarea>
          </div>
        </template>
        <div class="mb-3">
          <label class="form-label" for="customerUsername">Username *</label>
          <input id="customerUsername" v-model.trim="form.username" class="form-control" required minlength="3" maxlength="40" pattern="[A-Za-z0-9._-]+" autocomplete="username" />
          <small class="form-text">Letters, numbers, dot, underscore, or dash.</small>
        </div>
        <div class="mb-3">
          <label class="form-label" for="customerPassword">Password *</label>
          <div class="input-group">
            <input id="customerPassword" v-model="form.password" class="form-control" :type="showPassword ? 'text' : 'password'" required minlength="10" autocomplete="current-password" />
            <button class="btn btn-outline-secondary" type="button" @click="showPassword = !showPassword">
              <i :class="showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
            </button>
          </div>
          <small v-if="isRegister" class="form-text">At least 10 characters with uppercase, lowercase, number, and symbol.</small>
        </div>
        <div v-if="isRegister" class="mb-4">
          <label class="form-label" for="customerPasswordConfirm">Confirm password *</label>
          <input id="customerPasswordConfirm" v-model="form.confirmPassword" class="form-control" :type="showPassword ? 'text' : 'password'" required minlength="10" autocomplete="new-password" />
        </div>
        <button class="btn btn-danger btn-lg w-100" type="submit" :disabled="loading">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
          {{ loading ? 'Please wait...' : isRegister ? 'Create account' : 'Login' }}
        </button>
      </form>

      <p class="shop-auth-switch">
        {{ isRegister ? 'Already have an account?' : 'New customer?' }}
        <RouterLink :to="isRegister ? { name: 'shop-login', query: route.query } : { name: 'shop-register', query: route.query }">
          {{ isRegister ? 'Login' : 'Create an account' }}
        </RouterLink>
      </p>
    </div>
  </section>
</template>
