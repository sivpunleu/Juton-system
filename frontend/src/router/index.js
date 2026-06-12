import { createRouter, createWebHistory } from 'vue-router'
import AuditLogView from '../views/AuditLogView.vue'
import CustomerList from '../views/CustomerList.vue'
import DashboardView from '../views/DashboardView.vue'
import InvoiceForm from '../views/InvoiceForm.vue'
import InvoiceList from '../views/InvoiceList.vue'
import InvoicePreview from '../views/InvoicePreview.vue'
import LoginView from '../views/LoginView.vue'
import ProductList from '../views/ProductList.vue'
import ProfileView from '../views/ProfileView.vue'
import PaymentReceiptView from '../views/PaymentReceiptView.vue'
import ReportsView from '../views/ReportsView.vue'
import SalespersonList from '../views/SalespersonList.vue'
import SettingsView from '../views/SettingsView.vue'
import CustomerStatementView from '../views/CustomerStatementView.vue'
import SystemSettingsView from '../views/SystemSettingsView.vue'
import {
  currentAdmin,
  hasValidSession,
} from '../auth/session'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: () => (hasValidSession() ? '/dashboard' : '/login'),
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { guestOnly: true },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardView,
      meta: { requiresAuth: true },
    },
    {
      path: '/invoices',
      name: 'invoice-list',
      component: InvoiceList,
      meta: { requiresAuth: true },
    },
    {
      path: '/invoices/new',
      name: 'invoice-create',
      component: InvoiceForm,
      meta: { requiresAuth: true, roles: ['owner', 'admin'] },
    },
    {
      path: '/invoices/:id/edit',
      name: 'invoice-edit',
      component: InvoiceForm,
      meta: { requiresAuth: true, roles: ['owner', 'admin'] },
    },
    {
      path: '/invoices/:id',
      name: 'invoice-preview',
      component: InvoicePreview,
      meta: { requiresAuth: true },
    },
    {
      path: '/public/invoices/:token',
      name: 'public-invoice-preview',
      component: InvoicePreview,
    },
    {
      path: '/customers',
      name: 'customers',
      component: CustomerList,
      meta: { requiresAuth: true },
    },
    {
      path: '/customers/:id/statement',
      name: 'customer-statement',
      component: CustomerStatementView,
      meta: { requiresAuth: true },
    },
    {
      path: '/products',
      name: 'products',
      component: ProductList,
      meta: { requiresAuth: true },
    },
    {
      path: '/salespeople',
      name: 'salespeople',
      component: SalespersonList,
      meta: { requiresAuth: true },
    },
    {
      path: '/audit-logs',
      name: 'audit-logs',
      component: AuditLogView,
      meta: { requiresAuth: true, roles: ['owner', 'admin'] },
    },
    {
      path: '/reports',
      name: 'reports',
      component: ReportsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/invoices/:id/payments/:paymentId/receipt',
      name: 'payment-receipt',
      component: PaymentReceiptView,
      meta: { requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
      meta: { requiresAuth: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: { requiresAuth: true, roles: ['owner'] },
    },
    {
      path: '/system-settings',
      name: 'system-settings',
      component: SystemSettingsView,
      meta: { requiresAuth: true, roles: ['owner'] },
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const authenticated = hasValidSession()

  if (to.meta.requiresAuth && !authenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }

  if (to.meta.guestOnly && authenticated) {
    return { name: 'dashboard' }
  }

  if (
    to.meta.roles &&
    !to.meta.roles.includes(currentAdmin.value?.role)
  ) {
    return { name: 'dashboard' }
  }

  return true
})

export default router
