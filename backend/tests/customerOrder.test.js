import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import bcrypt from 'bcryptjs'

test('customer orders use server product prices and wait for admin confirmation', async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'jotun-billing-order-'),
  )
  process.env.LOCAL_DATA_DIR = dataDirectory

  try {
    const cacheKey = Date.now()
    const catalog = await import(
      `../repositories/catalogRepository.js?order=${cacheKey}`
    )
    const accounts = await import(
      `../repositories/customerAccountRepository.js?order=${cacheKey}`
    )
    const orders = await import(
      `../repositories/orderRepository.js?order=${cacheKey}`
    )

    const product = await catalog.createCatalogRecord('products', {
      name: 'Jotun Majestic',
      itemCode: 'M-100',
      unit: 'can',
      unitPrice: 42.5,
      stockQuantity: 5,
      lowStockThreshold: 1,
    })
    const customer = await catalog.createCatalogRecord('customers', {
      name: 'Dara',
      phone: '012 345 678',
      address: 'Phnom Penh',
    })
    const account = await accounts.createCustomerAccount({
      customerId: customer.id,
      username: 'dara.customer',
      passwordHash: await bcrypt.hash('StrongPassword123!', 4),
    })

    const order = await orders.createOrderFromCart({
      customer: {
        accountId: account.id,
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
      },
      items: [{ productId: product.id, quantity: 2, unitPrice: 0.01 }],
      customerNote: 'Please call first',
    })

    assert.match(order.orderNumber, /^ORD-\d{4}-00001$/)
    assert.equal(order.status, 'pending')
    assert.equal(order.items[0].unitPrice, 42.5)
    assert.equal(order.grandTotal, 85)
    assert.equal(
      (await catalog.findCatalogRecord('products', product.id)).stockQuantity,
      5,
    )

    const confirmed = await orders.updateOrderStatus(order.id, {
      status: 'confirmed',
      actor: 'owner',
    })
    assert.equal(confirmed.status, 'confirmed')

    const listed = await orders.listOrders({
      customerAccountId: account.id,
      limit: 10,
    })
    assert.equal(listed.total, 1)
    assert.equal(listed.items[0].customer.phone, customer.phone)
  } finally {
    delete process.env.LOCAL_DATA_DIR
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
