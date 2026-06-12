import { computed, ref } from 'vue'

const TOKEN_KEY = 'jotun_admin_token'
const ADMIN_KEY = 'jotun_admin_profile'

const readStorage = (key) => {
  if (typeof window === 'undefined') return ''
  return window.sessionStorage.getItem(key) || ''
}

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
  if (!token) return false
  const payload = decodeToken(token)
  return Boolean(payload?.exp && payload.exp * 1000 > Date.now())
}

const readAdmin = () => {
  try {
    return JSON.parse(readStorage(ADMIN_KEY)) || null
  } catch {
    return null
  }
}

const storedToken = readStorage(TOKEN_KEY)
export const authToken = ref(tokenIsValid(storedToken) ? storedToken : '')
export const currentAdmin = ref(authToken.value ? readAdmin() : null)
export const isAuthenticated = computed(() => Boolean(authToken.value))
export const canManageBilling = computed(() =>
  ['owner', 'admin'].includes(currentAdmin.value?.role),
)
export const isOwner = computed(
  () => currentAdmin.value?.role === 'owner',
)

let expirationTimer

const scheduleExpiration = (token) => {
  clearTimeout(expirationTimer)
  const payload = decodeToken(token)
  const delay = payload?.exp ? payload.exp * 1000 - Date.now() : 0

  if (delay <= 0) {
    clearAuthSession()
    return
  }

  expirationTimer = window.setTimeout(() => {
    clearAuthSession()
    window.dispatchEvent(new CustomEvent('auth:expired'))
  }, Math.min(delay, 2_147_483_647))
}

export const getAuthToken = () => {
  if (!tokenIsValid(authToken.value)) {
    clearAuthSession()
    return ''
  }
  return authToken.value
}

export const hasValidSession = () => Boolean(getAuthToken())

export const setAuthSession = ({ token, admin }) => {
  authToken.value = token
  currentAdmin.value = admin
  window.sessionStorage.setItem(TOKEN_KEY, token)
  window.sessionStorage.setItem(ADMIN_KEY, JSON.stringify(admin))
  scheduleExpiration(token)
}

export const updateCurrentAdmin = (admin) => {
  currentAdmin.value = {
    ...(currentAdmin.value || {}),
    ...admin,
  }
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(
      ADMIN_KEY,
      JSON.stringify(currentAdmin.value),
    )
  }
}

export const clearAuthSession = () => {
  clearTimeout(expirationTimer)
  authToken.value = ''
  currentAdmin.value = null
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(TOKEN_KEY)
    window.sessionStorage.removeItem(ADMIN_KEY)
  }
}

if (authToken.value && typeof window !== 'undefined') {
  scheduleExpiration(authToken.value)
}
