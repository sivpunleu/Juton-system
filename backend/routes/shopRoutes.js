import express from 'express'
import {
  createShopOrder,
  getCurrentCustomer,
  getMyShopOrders,
  getShopProducts,
  loginCustomer,
  registerCustomer,
} from '../controllers/shopController.js'
import { requireCustomer } from '../middleware/customerAuthMiddleware.js'
import { loginRateLimit } from '../middleware/loginRateLimit.js'

const router = express.Router()

router.get('/products', getShopProducts)
router.post('/auth/register', loginRateLimit, registerCustomer)
router.post('/auth/login', loginRateLimit, loginCustomer)
router.get('/auth/me', requireCustomer, getCurrentCustomer)
router
  .route('/orders')
  .get(requireCustomer, getMyShopOrders)
  .post(requireCustomer, createShopOrder)

export default router
