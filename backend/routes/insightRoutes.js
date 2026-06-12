import express from 'express'
import {
  getNotifications,
  globalSearch,
} from '../controllers/insightController.js'
import {
  getTelegramStatus,
  sendDebtAlertToTelegram,
} from '../controllers/telegramController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'

const router = express.Router()
const canManage = authorizeRoles('owner', 'admin')

router.get('/search', requireAdmin, globalSearch)
router.get('/notifications', requireAdmin, getNotifications)
router.get('/telegram/status', requireAdmin, getTelegramStatus)
router.post(
  '/telegram/debt-alerts',
  requireAdmin,
  canManage,
  sendDebtAlertToTelegram,
)

export default router
