import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('local backup snapshots restore business data safely', async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'jotun-billing-backup-'),
  )
  process.env.LOCAL_DATA_DIR = dataDirectory

  try {
    const cacheKey = Date.now()
    const repository = await import(
      `../repositories/invoiceRepository.js?backup=${cacheKey}`
    )
    const backupService = await import(
      `../services/backupService.js?backup=${cacheKey}`
    )

    await repository.insertInvoice({
      invoiceNumber: 'INV-2026-00001',
      invoiceDate: '2026-06-01T00:00:00.000Z',
      dueDate: '2026-06-10T00:00:00.000Z',
      customer: { name: 'Backup Customer' },
      items: [
        {
          description: 'Jotun Paint',
          colorCode: '1024',
          quantity: 1,
          unit: 'can',
          unitPrice: 50,
          total: 50,
        },
      ],
      subtotal: 50,
      grandTotal: 50,
      paidAmount: 0,
      balanceDue: 50,
      status: 'unpaid',
    })

    const snapshot = await backupService.createBackupSnapshot({
      type: 'manual',
      createdBy: 'owner',
      audit: false,
    })
    const stored = await backupService.getBackupDownloadPayload(snapshot.id)
    assert.equal(stored.payload.invoices.length, 1)

    await repository.insertInvoice({
      invoiceNumber: 'INV-2026-00002',
      invoiceDate: '2026-06-02T00:00:00.000Z',
      dueDate: '2026-06-11T00:00:00.000Z',
      customer: { name: 'Temporary Customer' },
      items: [
        {
          description: 'Temporary Paint',
          quantity: 1,
          unit: 'can',
          unitPrice: 10,
          total: 10,
        },
      ],
      subtotal: 10,
      grandTotal: 10,
      paidAmount: 0,
      balanceDue: 10,
      status: 'unpaid',
    })
    assert.equal((await repository.listInvoices({ limit: 10 })).total, 2)

    const result = await backupService.restoreDatabaseBackup(stored.payload, {
      actor: { username: 'owner' },
    })
    const restored = await repository.listInvoices({ limit: 10 })
    assert.equal(restored.total, 1)
    assert.equal(restored.items[0].invoiceNumber, 'INV-2026-00001')
    assert.equal(result.safetySnapshot.type, 'pre_restore')

    const backups = await backupService.listDatabaseBackups({ limit: 10 })
    assert.equal(backups.length >= 2, true)
  } finally {
    delete process.env.LOCAL_DATA_DIR
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
