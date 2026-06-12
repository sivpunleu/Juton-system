<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authApi } from '../api/invoices'
import { setAuthSession } from '../auth/session'
import {
  showSuccessAlert,
  showToast,
  validateForm,
} from '../ui/feedback'
import logo from '../assets/logo-marvel.png'
import jotunLogo from '../assets/jotun.jpg'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const error = ref('')
const showPassword = ref(false)
const form = reactive({
  username: '',
  password: '',
})

const expiredMessage = computed(() =>
  route.query.expired
    ? 'Session របស់អ្នកបានផុតកំណត់។ សូម Login ម្តងទៀត។'
    : '',
)

const submitLogin = async (event) => {
  if (!(await validateForm(event?.currentTarget))) return

  loading.value = true
  error.value = ''

  try {
    const response = await authApi.login(form)
    setAuthSession(response.data)
    const redirect =
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : '/invoices'
    await showSuccessAlert(
      `សូមស្វាគមន៍ ${response.data.admin?.displayName || response.data.admin?.username || ''}`,
      'Login បានជោគជ័យ',
    )
    await router.replace(redirect)
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message ||
      'មិនអាច Login បានទេ។ សូមពិនិត្យព័ត៌មានរបស់អ្នក។'
    showToast(error.value, 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <div class="login-marvel-brand">
          <span class="login-logo-frame login-logo-frame-marvel">
            <img :src="logo" alt="Marvel Decor" />
          </span>
          <span class="login-brand-copy">
            <strong>MARVEL DECOR</strong>
            <small>JOTUN BILLING</small>
          </span>
        </div>
        <span class="login-divider" aria-hidden="true"></span>
        <span class="login-logo-frame login-logo-frame-jotun">
          <img :src="jotunLogo" alt="Jotun" />
        </span>
      </div>

      <div class="login-heading">
        <span class="eyebrow">ADMIN ACCESS</span>
        <h1>ចូលប្រើប្រព័ន្ធ</h1>
        <p>Login ដើម្បីគ្រប់គ្រង និងបង្កើតវិក្កយបត្រ។</p>
      </div>

      <div v-if="expiredMessage" class="alert alert-warning">
        {{ expiredMessage }}
      </div>
      <div v-if="error" class="alert alert-danger">{{ error }}</div>

      <form novalidate @submit.prevent="submitLogin">
        <div class="mb-3">
          <label class="form-label" for="adminUsername">ឈ្មោះអ្នកប្រើប្រាស់ *</label>
          <div class="input-group">
            <span class="input-group-text"><i class="bi bi-person"></i></span>
            <input
              id="adminUsername"
              v-model.trim="form.username"
              class="form-control"
              autocomplete="username"
              minlength="3"
              required
            />
          </div>
        </div>

        <div class="mb-4">
          <label class="form-label" for="adminPassword">ពាក្យសម្ងាត់ *</label>
          <div class="input-group">
            <span class="input-group-text"><i class="bi bi-lock"></i></span>
            <input
              id="adminPassword"
              v-model="form.password"
              class="form-control"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              minlength="8"
              required
            />
            <button
              class="btn btn-outline-secondary password-toggle"
              type="button"
              :aria-label="showPassword ? 'លាក់ពាក្យសម្ងាត់' : 'បង្ហាញពាក្យសម្ងាត់'"
              @click="showPassword = !showPassword"
            >
              <i :class="showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
            </button>
          </div>
        </div>

        <button class="btn btn-danger btn-lg w-100" type="submit" :disabled="loading">
          <span
            v-if="loading"
            class="spinner-border spinner-border-sm me-2"
            role="status"
          ></span>
          <i v-else class="bi bi-box-arrow-in-right me-2"></i>
          {{ loading ? 'កំពុង Login...' : 'Login' }}
        </button>
      </form>

      <p class="login-security-note">
        <i class="bi bi-shield-lock me-1"></i>
        Session នឹងផុតកំណត់ដោយស្វ័យប្រវត្តិ។
      </p>
    </div>
  </section>
</template>
