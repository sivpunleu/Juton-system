import { computed, ref } from 'vue'

const TOKEN_KEY = 'jotun_customer_token'
const CUSTOMER_KEY = 'jotun_customer_profile'

const readStorage = (key) =>
  typeof window === 'undefined' ? '' : window.sessionStorage.getItem(key) || ''

const decodeToken = (token) => {
  try {
    const payload = token.split('.')[1]
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const normalized = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      '=',
    )
    return JSON.parse(window.atob(normalized))
  } catch {
    return null
  }
}

const tokenIsValid = (token) => {
  const payload = decodeToken(token)
  return Boolean(token && payload?.exp && payload.exp * 1000 > Date.now())
}

const readCustomer = () => {
  try {
    return JSON.parse(readStorage(CUSTOMER_KEY)) || null
  } catch {
    return null
  }
}

const storedToken = readStorage(TOKEN_KEY)
export const customerToken = ref(tokenIsValid(storedToken) ? storedToken : '')
export const currentCustomer = ref(customerToken.value ? readCustomer() : null)
export const isCustomerAuthenticated = computed(() => Boolean(customerToken.value))

let expirationTimer

const scheduleExpiration = (token) => {
  clearTimeout(expirationTimer)
  const payload = decodeToken(token)
  const delay = payload?.exp ? payload.exp * 1000 - Date.now() : 0
  if (delay <= 0) {
    clearCustomerSession()
    return
  }
  expirationTimer = window.setTimeout(() => {
    clearCustomerSession()
    window.dispatchEvent(new CustomEvent('customer:expired'))
  }, Math.min(delay, 2_147_483_647))
}

export const getCustomerToken = () => {
  if (!tokenIsValid(customerToken.value)) {
    clearCustomerSession()
    return ''
  }
  return customerToken.value
}

export const hasValidCustomerSession = () => Boolean(getCustomerToken())

export const setCustomerSession = ({ token, customer }) => {
  customerToken.value = token
  currentCustomer.value = customer
  window.sessionStorage.setItem(TOKEN_KEY, token)
  window.sessionStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer))
  scheduleExpiration(token)
}

export const clearCustomerSession = () => {
  clearTimeout(expirationTimer)
  customerToken.value = ''
  currentCustomer.value = null
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(TOKEN_KEY)
    window.sessionStorage.removeItem(CUSTOMER_KEY)
  }
}

if (customerToken.value && typeof window !== 'undefined') {
  scheduleExpiration(customerToken.value)
}
