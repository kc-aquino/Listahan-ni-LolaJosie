import { openDB } from 'idb'
import type { OfflineState } from './offlineModel'
import { emptyState } from './offlineModel'

const channel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lista-offline-events') : null
if (channel) channel.onmessage = () => window.dispatchEvent(new Event('lista:offline-external'))

const db = () => openDB('lista-offline-v1', 1, { upgrade(database) { database.createObjectStore('ledger') } })
export const notifyOffline = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('lista:offline-change'))
  channel?.postMessage('changed')
}
export async function readOfflineState(userId: string): Promise<OfflineState> {
  const database = await db()
  return (await database.get('ledger', userId)) ?? emptyState()
}
export async function changeOfflineState(userId: string, change: (state: OfflineState) => void, notify = true) {
  const database = await db()
  const transaction = database.transaction('ledger', 'readwrite')
  const state: OfflineState = (await transaction.store.get(userId)) ?? emptyState()
  change(state)
  await transaction.store.put(state, userId)
  await transaction.done
  if (notify) notifyOffline()
}
