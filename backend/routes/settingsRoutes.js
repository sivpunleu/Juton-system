import express from 'express'
import {
  readSystemSettings,
  updateSystemSettings,
} from '../controllers/settingsController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'

const router = express.Router()

router.get('/', readSystemSettings)
router.put(
  '/',
  requireAdmin,
  authorizeRoles('owner'),
  updateSystemSettings,
)

export default router
