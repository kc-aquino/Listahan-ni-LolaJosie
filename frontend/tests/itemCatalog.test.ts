import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getItemCatalog } from '../src/lib/api'

test('catalog includes all pages and reuses latest saved price across customers', async () => {
  const previousFetch = globalThis.fetch
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { sessionStorage: { getItem: () => null } } })
  const calls: string[] = []
  const record = (occurredAt: string, itemName: string, unitPrice: string) => ({
    status: 'ACTIVE', occurredAt, items: [{ itemName, unitPrice }],
  })
  globalThis.fetch = async (input) => {
    const path = String(input)
    calls.push(path)
    let data: unknown[] = []
    let totalPages = 1
    if (path.includes('/customers?')) {
      totalPages = 2
      data = path.includes('page=2') ? [{ id: 'b' }] : [{ id: 'a' }]
    } else if (path.includes('/a/transactions')) {
      totalPages = 2
      data = path.includes('page=2') ? [record('2026-10-01', 'Bread', '15.00')] : [record('2026-11-01', 'Rice', '50.00')]
    } else if (path.includes('/b/transactions')) {
      data = [record('2026-11-02', 'rice', '55.00')]
    } else throw new Error(`Unexpected request: ${path}`)
    return new Response(JSON.stringify({ data, pagination: { totalPages, page: 1, pageSize: 100, totalItems: 2 } }), { status: 200 })
  }
  try {
    assert.deepEqual(await getItemCatalog(), [
      { itemName: 'Bread', unitPrice: '15.00' },
      { itemName: 'rice', unitPrice: '55.00' },
    ])
    assert.ok(calls.some((path) => path.includes('/customers?') && path.includes('page=2')))
    assert.ok(calls.some((path) => path.includes('/a/transactions') && path.includes('page=2')))
  } finally {
    globalThis.fetch = previousFetch
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
