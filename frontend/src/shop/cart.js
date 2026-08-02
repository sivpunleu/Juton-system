import { computed, ref } from 'vue'

const CART_KEY = 'jotun_shop_cart'

const readCart = () => {
  if (typeof window === 'undefined') return []
  try {
    const items = JSON.parse(window.localStorage.getItem(CART_KEY) || '[]')
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

export const cartItems = ref(readCart())

const persist = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CART_KEY, JSON.stringify(cartItems.value))
  }
}

export const cartCount = computed(() =>
  cartItems.value.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
)

export const cartSubtotal = computed(() =>
  cartItems.value.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  ),
)

export const addToCart = (product) => {
  if (!product?.id || !product.inStock) return false
  const existing = cartItems.value.find((item) => item.productId === product.id)
  if (existing) existing.quantity = Math.min(1000, Number(existing.quantity || 0) + 1)
  else {
    cartItems.value.push({
      productId: product.id,
      name: product.name,
      itemCode: product.itemCode || '',
      colorCode: product.colorCode || '',
      unit: product.unit,
      unitPrice: Number(product.unitPrice || 0),
      quantity: 1,
    })
  }
  persist()
  return true
}

export const setCartQuantity = (productId, quantity) => {
  const item = cartItems.value.find((entry) => entry.productId === productId)
  if (!item) return
  const normalized = Math.floor(Number(quantity))
  if (!Number.isFinite(normalized) || normalized <= 0) {
    cartItems.value = cartItems.value.filter((entry) => entry.productId !== productId)
  } else {
    item.quantity = Math.min(1000, normalized)
  }
  persist()
}

export const removeFromCart = (productId) => {
  cartItems.value = cartItems.value.filter((item) => item.productId !== productId)
  persist()
}

export const clearCart = () => {
  cartItems.value = []
  persist()
}
