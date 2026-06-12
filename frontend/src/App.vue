<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GlobalSearch from './components/GlobalSearch.vue'
import NotificationCenter from './components/NotificationCenter.vue'
import {
  canManageBilling,
  clearAuthSession,
  currentAdmin,
  isAuthenticated,
  isOwner,
} from './auth/session'
import {
  requestConfirmation,
  showSuccessAlert,
} from './ui/feedback'
import logo from './assets/logo-marvel.png'
import jotunLogo from './assets/jotun.jpg'

const route = useRoute()
const router = useRouter()
const sidebarOpen = ref(false)
const online = ref(
  typeof navigator === 'undefined' ? true : navigator.onLine,
)
const sidebarCollapsed = ref(
  typeof window !== 'undefined' &&
    window.localStorage.getItem('jotun_sidebar_collapsed') === 'true',
)
const showWorkspace = computed(
  () =>
    isAuthenticated.value &&
    route.name !== 'login' &&
    route.name !== 'public-invoice-preview',
)
const pageMeta = computed(() => {
  const pages = {
    dashboard: ['ផ្ទាំងគ្រប់គ្រង', 'Business overview'],
    'invoice-list': ['វិក្កយបត្រ', 'Invoice management'],
    'invoice-create': ['បង្កើតវិក្កយបត្រ', 'New invoice'],
    'invoice-edit': ['កែប្រែវិក្កយបត្រ', 'Edit invoice'],
    'invoice-preview': ['មើលវិក្កយបត្រ', 'Invoice preview'],
    customers: ['អតិថិជន', 'Customer management'],
    products: ['ទំនិញ', 'Product catalogue'],
    salespeople: ['ក្រុមការងារ Sale', 'Sales team management'],
    'audit-logs': ['ប្រវត្តិសកម្មភាព', 'Audit log'],
    reports: ['Reports', 'Revenue and performance'],
    'customer-statement': ['Customer Statement', 'Billing history'],
    'payment-receipt': ['Payment Receipt', 'Printable receipt'],
    profile: ['Profile', 'My account'],
    settings: ['Admin Accounts', 'User management'],
    'system-settings': ['System Settings', 'Company and invoice setup'],
  }

  return pages[route.name] || ['Marvel Decor', 'Billing system']
})
const currentDate = computed(() =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date()),
)
const initials = computed(() => {
  const source =
    currentAdmin.value?.displayName || currentAdmin.value?.username || 'A'
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
})

watch(
  () => route.fullPath,
  () => {
    sidebarOpen.value = false
  },
)

watch(sidebarCollapsed, (value) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('jotun_sidebar_collapsed', String(value))
  }
})

const updateNetworkStatus = () => {
  online.value = navigator.onLine
}

onMounted(() => {
  window.addEventListener('online', updateNetworkStatus)
  window.addEventListener('offline', updateNetworkStatus)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', updateNetworkStatus)
  window.removeEventListener('offline', updateNetworkStatus)
})

const logout = async () => {
  const confirmed = await requestConfirmation({
    title: 'ចាកចេញពីប្រព័ន្ធ?',
    message: 'តើអ្នកប្រាកដថាចង់ចាកចេញពីគណនីនេះមែនទេ?',
    confirmLabel: 'ចាកចេញ',
    cancelLabel: 'នៅបន្ត',
    tone: 'danger',
  })
  if (!confirmed) return

  clearAuthSession()
  await router.replace('/login')
  await showSuccessAlert(
    'អ្នកបានចាកចេញពីប្រព័ន្ធដោយជោគជ័យ។',
    'ចាកចេញបានជោគជ័យ',
  )
}
</script>

<template>
  <div
    class="app-shell"
    :class="{
      'has-sidebar': showWorkspace,
      'sidebar-collapsed': showWorkspace && sidebarCollapsed,
    }"
  >
    <template v-if="showWorkspace">
      <aside
        class="app-sidebar d-print-none"
        :class="{ open: sidebarOpen }"
      >
        <div class="sidebar-brand">
          <RouterLink to="/dashboard" title="ផ្ទាំងគ្រប់គ្រង">
            <img :src="logo" alt="Marvel Decor" />
            <span>
              <strong>MARVEL DECOR</strong>
              <small>JOTUN BILLING</small>
            </span>
          </RouterLink>
          <button
            class="sidebar-close"
            type="button"
            aria-label="Close menu"
            @click="sidebarOpen = false"
          >
            <i class="bi bi-x-lg"></i>
          </button>
          <button
            class="sidebar-collapse-toggle"
            type="button"
            :title="sidebarCollapsed ? 'ពង្រីក Sidebar' : 'បង្រួម Sidebar'"
            :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            <i
              :class="
                sidebarCollapsed
                  ? 'bi bi-chevron-double-right'
                  : 'bi bi-chevron-double-left'
              "
            ></i>
          </button>
        </div>

        <nav class="sidebar-nav">
          <span class="sidebar-label">OVERVIEW</span>
          <RouterLink to="/dashboard">
            <i class="bi bi-grid-1x2"></i>
            <span>ផ្ទាំងគ្រប់គ្រង</span>
          </RouterLink>
          <RouterLink to="/invoices" title="វិក្កយបត្រ">
            <i class="bi bi-receipt"></i>
            <span>វិក្កយបត្រ</span>
          </RouterLink>

          <span class="sidebar-label">BUSINESS</span>
          <RouterLink to="/customers" title="អតិថិជន">
            <i class="bi bi-people"></i>
            <span>អតិថិជន</span>
          </RouterLink>
          <RouterLink to="/products" title="ទំនិញ">
            <i class="bi bi-box-seam"></i>
            <span>ទំនិញ</span>
          </RouterLink>
          <RouterLink to="/salespeople" title="ក្រុមការងារ Sale">
            <i class="bi bi-person-badge"></i>
            <span>ក្រុមការងារ Sale</span>
          </RouterLink>
          <RouterLink to="/reports" title="Reports">
            <i class="bi bi-bar-chart-line"></i>
            <span>Reports</span>
          </RouterLink>

          <span
            v-if="canManageBilling"
            class="sidebar-label"
          >
            MANAGEMENT
          </span>
          <RouterLink
            v-if="canManageBilling"
            to="/audit-logs"
            title="ប្រវត្តិសកម្មភាព"
          >
            <i class="bi bi-clock-history"></i>
            <span>ប្រវត្តិសកម្មភាព</span>
          </RouterLink>
          <RouterLink v-if="isOwner" to="/settings" title="Admin Accounts">
            <i class="bi bi-shield-lock"></i>
            <span>Admin Accounts</span>
          </RouterLink>
          <RouterLink
            v-if="isOwner"
            to="/system-settings"
            title="System Settings"
          >
            <i class="bi bi-sliders"></i>
            <span>System Settings</span>
          </RouterLink>
        </nav>

        <RouterLink
          v-if="canManageBilling"
          class="sidebar-create"
          to="/invoices/new"
        >
          <i class="bi bi-plus-lg"></i>
          <span>បង្កើតវិក្កយបត្រ</span>
        </RouterLink>

        <div class="sidebar-user">
          <RouterLink class="sidebar-profile" to="/profile">
            <img
              v-if="currentAdmin?.avatar"
              :src="currentAdmin.avatar"
              alt="Profile"
            />
            <span v-else class="sidebar-avatar">{{ initials }}</span>
            <span class="sidebar-user-copy">
              <strong>
                {{ currentAdmin?.displayName || currentAdmin?.username }}
              </strong>
              <small>{{ currentAdmin?.role }}</small>
            </span>
          </RouterLink>
          <button type="button" title="Logout" @click="logout">
            <i class="bi bi-box-arrow-right"></i>
          </button>
        </div>
      </aside>

      <button
        v-if="sidebarOpen"
        class="sidebar-overlay d-print-none"
        type="button"
        aria-label="Close menu"
        @click="sidebarOpen = false"
      ></button>

      <header class="mobile-app-header d-print-none">
        <button
          class="mobile-menu-button"
          type="button"
          aria-label="Open menu"
          @click="sidebarOpen = true"
        >
          <i class="bi bi-list"></i>
        </button>
        <RouterLink to="/dashboard">
          <img :src="logo" alt="Marvel Decor" />
          <strong>MARVEL DECOR</strong>
        </RouterLink>
        <RouterLink class="mobile-profile" to="/profile">
          <img
            v-if="currentAdmin?.avatar"
            :src="currentAdmin.avatar"
            alt="Profile"
          />
          <span v-else>{{ initials }}</span>
        </RouterLink>
      </header>

      <header class="desktop-app-header d-print-none">
        <div class="topbar-heading">
          <small>{{ pageMeta[1] }}</small>
          <h1>{{ pageMeta[0] }}</h1>
        </div>
        <GlobalSearch />
        <div class="topbar-actions">
          <div class="topbar-date">
            <i class="bi bi-calendar3"></i>
            <span>{{ currentDate }}</span>
          </div>
          <RouterLink
            v-if="canManageBilling && route.name !== 'invoice-create'"
            class="btn btn-danger topbar-create"
            to="/invoices/new"
          >
            <i class="bi bi-plus-lg"></i>
            <span>វិក្កយបត្រថ្មី</span>
          </RouterLink>
          <NotificationCenter />
          <RouterLink class="topbar-profile" to="/profile">
            <img
              v-if="currentAdmin?.avatar"
              :src="currentAdmin.avatar"
              alt="Profile"
            />
            <span v-else class="topbar-avatar">{{ initials }}</span>
            <span>
              <strong>
                {{ currentAdmin?.displayName || currentAdmin?.username }}
              </strong>
              <small>{{ currentAdmin?.role }}</small>
            </span>
            <i class="bi bi-chevron-down"></i>
          </RouterLink>
        </div>
      </header>
    </template>

    <header
      v-else-if="
        route.name !== 'invoice-preview' &&
        route.name !== 'public-invoice-preview' &&
        route.name !== 'login'
      "
      class="public-header d-print-none"
    >
      <RouterLink class="public-brand-lockup" to="/login">
        <span class="public-logo-frame public-logo-frame-marvel">
          <img :src="logo" alt="Marvel Decor" />
        </span>
        <span class="public-brand-divider" aria-hidden="true"></span>
        <span class="public-logo-frame public-logo-frame-jotun">
          <img :src="jotunLogo" alt="Jotun" />
        </span>
      </RouterLink>
    </header>

    <main class="app-content">
      <div v-if="!online" class="network-status-banner d-print-none">
        <i class="bi bi-wifi-off"></i>
        <span>
          អ៊ីនធឺណិតបានផ្ដាច់។ ទិន្នន័យដែលមិនទាន់រក្សាទុកនឹងនៅលើ Form នេះ។
        </span>
      </div>
      <RouterView />
    </main>

    <footer
      v-if="
        !showWorkspace &&
        route.name !== 'invoice-preview' &&
        route.name !== 'public-invoice-preview' &&
        route.name !== 'login'
      "
      class="app-footer d-print-none"
    >
      <div class="container d-flex flex-wrap justify-content-between gap-2">
        <span>Marvel Decor Billing System</span>
        <span>Secure billing and customer management</span>
      </div>
    </footer>

  </div>
</template>
