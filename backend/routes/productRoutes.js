import express from 'express'
import {
  productController,
  updateProductStock,
} from '../controllers/catalogController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'

const router = express.Router()
const canManage = authorizeRoles('owner', 'admin')

router
  .route('/')
  .get(requireAdmin, productController.list)
  .post(requireAdmin, canManage, productController.create)
router.post('/:id/stock', requireAdmin, canManage, updateProductStock)
router.post(
  '/:id/restore',
  requireAdmin,
  canManage,
  productController.restore,
)
router
  .route('/:id')
  .put(requireAdmin, canManage, productController.update)
  .delete(requireAdmin, canManage, productController.remove)

export default router
