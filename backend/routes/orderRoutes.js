import express from 'express'
import {
  changeOrderStatus,
  convertOrderToInvoice,
  getOrderById,
  getOrders,
} from '../controllers/orderController.js'
import { authorizeRoles, requireAdmin } from '../middleware/authMiddleware.js'

const router = express.Router()
const canManage = authorizeRoles('owner', 'admin')

router.get('/', requireAdmin, getOrders)
router.get('/:id', requireAdmin, getOrderById)
router.put('/:id/status', requireAdmin, canManage, changeOrderStatus)
router.post('/:id/convert', requireAdmin, canManage, convertOrderToInvoice)

export default router
