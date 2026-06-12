import express from 'express'
import {
  addInvoicePayment,
  createInvoice,
  deleteInvoice,
  getDashboard,
  getInvoiceById,
  getInvoices,
  getPublicInvoiceByToken,
  restoreDeletedInvoice,
  updateInvoice,
} from '../controllers/invoiceController.js'
import { getPaymentReceipt } from '../controllers/insightController.js'
import {
  sendInvoiceToTelegram,
  sendReceiptToTelegram,
} from '../controllers/telegramController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'

const router = express.Router()
const canManage = authorizeRoles('owner', 'admin')

router.get('/public/:token', getPublicInvoiceByToken)
router.get('/dashboard', requireAdmin, getDashboard)
router
  .route('/')
  .get(requireAdmin, getInvoices)
  .post(requireAdmin, canManage, createInvoice)
router.get(
  '/:id/payments/:paymentId/receipt',
  requireAdmin,
  getPaymentReceipt,
)
router.post(
  '/:id/payments/:paymentId/telegram',
  requireAdmin,
  canManage,
  sendReceiptToTelegram,
)
router.post('/:id/payments', requireAdmin, canManage, addInvoicePayment)
router.post(
  '/:id/telegram',
  requireAdmin,
  canManage,
  sendInvoiceToTelegram,
)
router.post('/:id/restore', requireAdmin, canManage, restoreDeletedInvoice)
router
  .route('/:id')
  .get(requireAdmin, getInvoiceById)
  .put(requireAdmin, canManage, updateInvoice)
  .delete(requireAdmin, canManage, deleteInvoice)

export default router
