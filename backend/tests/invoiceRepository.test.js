import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('local repository sequences, paginates, deletes, and restores', async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'jotun-billing-repository-'),
  )
  process.env.LOCAL_DATA_DIR = dataDirectory

  try {
    const repository = await import(
      `../repositories/invoiceRepository.js?test=${Date.now()}`
    )
    const firstNumber = await repository.reserveInvoiceNumber('2026-06-08')
    const secondNumber = await repository.reserveInvoiceNumber('2026-06-08')
    assert.equal(firstNumber, 'INV-2026-00001')
    assert.equal(secondNumber, 'INV-2026-00002')

    const invoice = await repository.insertInvoice({
      invoiceNumber: firstNumber,
      invoiceDate: '2026-06-08T00:00:00.000Z',
      dueDate: '2026-06-15T00:00:00.000Z',
      customer: { name: 'Repository Test' },
      items: [],
      subtotal: 10,
      grandTotal: 10,
      paidAmount: 0,
      balanceDue: 10,
      status: 'unpaid',
    })
    const active = await repository.listInvoices({ page: 1, limit: 10 })
    assert.equal(active.total, 1)
    assert.equal(active.items[0].invoiceNumber, firstNumber)
    assert.equal(typeof invoice.shareToken, 'string')
    assert.equal(invoice.shareToken.length > 20, true)

    const publicInvoice = await repository.findInvoiceByShareToken(
      invoice.shareToken,
    )
    assert.equal(publicInvoice.id, invoice.id)

    await repository.softDeleteInvoice(invoice.id, 'tester')
    const afterDelete = await repository.listInvoices({})
    const trash = await repository.listInvoices({ deleted: true })
    const deletedPublicInvoice = await repository.findInvoiceByShareToken(
      invoice.shareToken,
    )
    assert.equal(afterDelete.total, 0)
    assert.equal(trash.total, 1)
    assert.equal(deletedPublicInvoice, null)

    await repository.restoreInvoice(invoice.id, 'tester')
    const afterRestore = await repository.listInvoices({})
    assert.equal(afterRestore.total, 1)
  } finally {
    delete process.env.LOCAL_DATA_DIR
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
