import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('local stock movements and system settings persist correctly', async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'jotun-billing-business-'),
  )
  process.env.LOCAL_DATA_DIR = dataDirectory

  try {
    const catalog = await import(
      `../repositories/catalogRepository.js?business=${Date.now()}`
    )
    const settings = await import(
      `../repositories/settingsRepository.js?business=${Date.now()}`
    )

    const product = await catalog.createCatalogRecord('products', {
      name: 'Jotun Test Paint',
      itemCode: 'TEST-001',
      unit: 'can',
      unitPrice: 25,
      stockQuantity: 10,
      lowStockThreshold: 3,
    })
    const stockedIn = await catalog.recordProductStockMovement(product.id, {
      type: 'in',
      quantity: 5,
      note: 'Purchase',
      actor: 'owner',
    })
    assert.equal(stockedIn.stockQuantity, 15)

    const stockedOut = await catalog.recordProductStockMovement(product.id, {
      type: 'out',
      quantity: 4,
      note: 'Sale',
      actor: 'owner',
    })
    assert.equal(stockedOut.stockQuantity, 11)
    assert.equal(stockedOut.stockMovements.length, 2)
    assert.equal(stockedOut.stockMovements[1].resultingStock, 11)

    const invoices = await import(
      `../repositories/invoiceRepository.js?stock=${Date.now()}`
    )
    const invoice = await invoices.insertInvoice({
      invoiceNumber: 'INV-2026-00010',
      invoiceDate: '2026-06-10T00:00:00.000Z',
      dueDate: '2026-06-15T00:00:00.000Z',
      customer: { name: 'Stock Customer' },
      items: [
        {
          productId: product.id,
          description: product.name,
          quantity: 3,
          unit: product.unit,
          unitPrice: product.unitPrice,
          total: 75,
        },
      ],
      subtotal: 75,
      grandTotal: 75,
      paidAmount: 0,
      balanceDue: 75,
      status: 'unpaid',
    })
    assert.equal(invoice.stockApplied, true)

    const afterInvoice = await catalog.findCatalogRecord('products', product.id)
    assert.equal(afterInvoice.stockQuantity, 8)

    await invoices.replaceInvoice(invoice.id, (existing) => ({
      ...existing,
      status: 'cancelled',
    }))
    const afterCancel = await catalog.findCatalogRecord('products', product.id)
    assert.equal(afterCancel.stockQuantity, 11)

    const salesperson = await catalog.createCatalogRecord('salespeople', {
      name: 'Sokha Sale',
      phone: '012 345 678',
      notes: 'North area',
    })
    const salespeople = await catalog.listCatalogRecords('salespeople', {
      search: 'Sokha',
    })
    assert.equal(salespeople.total, 1)
    assert.equal(salespeople.items[0].id, salesperson.id)

    await settings.saveSystemSettings({
      companyName: 'Updated Company',
      phones: ['012 345 678'],
      sellerSignature: 'data:image/png;base64,c2lnbmF0dXJl',
      updatedBy: 'owner',
    })
    const savedSettings = await settings.getSystemSettings()
    assert.equal(savedSettings.companyName, 'Updated Company')
    assert.deepEqual(savedSettings.phones, ['012 345 678'])
    assert.equal(
      savedSettings.sellerSignature,
      'data:image/png;base64,c2lnbmF0dXJl',
    )
  } finally {
    delete process.env.LOCAL_DATA_DIR
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

test('revenue report groups deposits and payment history by date', async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'jotun-billing-report-'),
  )
  process.env.LOCAL_DATA_DIR = dataDirectory

  try {
    const repository = await import(
      `../repositories/invoiceRepository.js?report=${Date.now()}`
    )
    const controller = await import(
      `../controllers/reportController.js?report=${Date.now()}`
    )

    await repository.insertInvoice({
      invoiceNumber: 'INV-2026-00001',
      invoiceDate: '2026-06-01T00:00:00.000Z',
      dueDate: '2026-06-10T00:00:00.000Z',
      customer: { name: 'Report Customer' },
      salesChannel: 'salesperson',
      salespersonId: 'sale-1',
      salesperson: { name: 'Sokha Sale', phone: '012 345 678' },
      items: [
        {
          description: 'Jotun Paint',
          colorCode: '1024',
          quantity: 2,
          unit: 'can',
          unitPrice: 50,
          total: 100,
        },
      ],
      subtotal: 100,
      grandTotal: 100,
      depositAmount: 20,
      paidAmount: 50,
      balanceDue: 50,
      status: 'partially_paid',
      payments: [
        {
          id: 'payment-1',
          amount: 30,
          paidAt: '2026-06-05T00:00:00.000Z',
          receivedBy: 'Owner',
        },
      ],
    })

    let responseBody
    let statusCode = 200
    const req = {
      query: {
        from: '2026-06-01',
        to: '2026-06-30',
        groupBy: 'day',
      },
    }
    const res = {
      status(code) {
        statusCode = code
        return this
      },
      json(payload) {
        responseBody = payload
        return this
      },
    }

    await controller.getRevenueReport(req, res)
    assert.equal(statusCode, 200)
    assert.equal(responseBody.summary.revenue, 50)
    assert.equal(responseBody.summary.invoiceCount, 1)
    assert.deepEqual(
      responseBody.trend.map((item) => item.revenue),
      [20, 30],
    )
    assert.equal(responseBody.salesPerformance[0].label, 'Sokha Sale')
    assert.equal(responseBody.salesPerformance[0].invoiced, 100)
    assert.equal(responseBody.salesItems[0].productName, 'Jotun Paint')
    assert.equal(responseBody.salesItems[0].quantity, 2)

    await controller.getReportAnalytics(req, res)
    assert.equal(statusCode, 200)
    assert.equal(responseBody.monthlyRevenue[0].label, '2026-06')
    assert.equal(responseBody.bestSellingProducts[0].productName, 'Jotun Paint')
    assert.equal(
      responseBody.debtAging.reduce((sum, item) => sum + item.amount, 0),
      50,
    )
  } finally {
    delete process.env.LOCAL_DATA_DIR
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
