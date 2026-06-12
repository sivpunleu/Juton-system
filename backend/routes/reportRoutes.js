import express from 'express'
import {
  createManualBackupSnapshot,
  downloadBackupSnapshot,
  exportDatabaseBackup,
  exportInvoicesCsv,
  getRevenueReport,
  listBackupSnapshots,
  restoreBackupSnapshot,
  restoreUploadedBackup,
} from '../controllers/reportController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'

const router = express.Router()

router.get('/revenue', requireAdmin, getRevenueReport)
router.get('/invoices.csv', requireAdmin, exportInvoicesCsv)
router.get(
  '/backups',
  requireAdmin,
  authorizeRoles('owner'),
  listBackupSnapshots,
)
router.post(
  '/backups',
  requireAdmin,
  authorizeRoles('owner'),
  createManualBackupSnapshot,
)
router.get(
  '/backups/:id.json',
  requireAdmin,
  authorizeRoles('owner'),
  downloadBackupSnapshot,
)
router.post(
  '/backups/:id/restore',
  requireAdmin,
  authorizeRoles('owner'),
  restoreBackupSnapshot,
)
router.post(
  '/backup/restore',
  requireAdmin,
  authorizeRoles('owner'),
  restoreUploadedBackup,
)
router.get(
  '/backup.json',
  requireAdmin,
  authorizeRoles('owner'),
  exportDatabaseBackup,
)

export default router
