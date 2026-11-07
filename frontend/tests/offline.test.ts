import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError, createCustomer } from '../src/lib/api'

test('new customer creation requires a connection rather than entering the financial queue', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const originalFetch = globalThis.fetch
  let requests = 0
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } })
  globalThis.fetch = async () => { requests++; throw new Error('Should not reach the network') }
  try {
    await assert.rejects(createCustomer({ name: 'Offline test' }), (error) => error instanceof ApiError && error.status === 0)
    assert.equal(requests, 0)
  } finally {
    globalThis.fetch = originalFetch
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor)
    else Reflect.deleteProperty(globalThis, 'navigator')
  }
})
