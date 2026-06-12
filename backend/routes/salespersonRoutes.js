import express from 'express'
import { salespersonController } from '../controllers/catalogController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'

const router = express.Router()
const canManage = authorizeRoles('owner', 'admin')

router
  .route('/')
  .get(requireAdmin, salespersonController.list)
  .post(requireAdmin, canManage, salespersonController.create)
router.post(
  '/:id/restore',
  requireAdmin,
  canManage,
  salespersonController.restore,
)
router
  .route('/:id')
  .put(requireAdmin, canManage, salespersonController.update)
  .delete(requireAdmin, canManage, salespersonController.remove)

export default router
