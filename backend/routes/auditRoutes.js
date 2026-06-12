import express from 'express'
import { getAuditLogs } from '../controllers/auditController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'

const router = express.Router()

router.get(
  '/',
  requireAdmin,
  authorizeRoles('owner', 'admin'),
  getAuditLogs,
)

export default router
