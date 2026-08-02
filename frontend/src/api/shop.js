import axios from 'axios'
import {
  clearCustomerSession,
  getCustomerToken,
} from '../auth/customerSession.js'

const productionApiUrl = 'https://jotun-mysql-api.onrender.com/api'
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
const baseURL = (
  configuredApiUrl || (import.meta.env.PROD ? productionApiUrl : '/api')
).replace(/\/+$/, '')

const shopClient = axios.create({
  baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

shopClient.interceptors.request.use((config) => {
  const token = getCustomerToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

shopClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && error.config?.headers?.Authorization) {
      clearCustomerSession()
      window.dispatchEvent(new CustomEvent('customer:expired'))
    }
    return Promise.reject(error)
  },
)

export const shopApi = {
  products(params = {}) {
    return shopClient.get('/shop/products', { params })
  },
  register(payload) {
    return shopClient.post('/shop/auth/register', payload)
  },
  login(payload) {
    return shopClient.post('/shop/auth/login', payload)
  },
  me() {
    return shopClient.get('/shop/auth/me')
  },
  orders(params = {}) {
    return shopClient.get('/shop/orders', { params })
  },
  createOrder(payload) {
    return shopClient.post('/shop/orders', payload)
  },
}
