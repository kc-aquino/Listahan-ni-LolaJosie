import type { ReactNode } from 'react'
import { Icon } from '../atoms/Icon'
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../app/AuthProvider'
import { useLanguage } from '../../app/LanguageProvider'
import { discardEntry, retryEntry, syncOfflineLedger } from '../../lib/offline'
import { readOfflineState } from '../../lib/offlineStore'
import { emptyState } from '../../lib/offlineModel'
import type { OfflineState, PaymentInput } from '../../lib/offlineModel'
import { draftDebt } from '../../lib/offlineModel'
import { formatDate } from '../../lib/date'
import { ConfirmationDialog } from './ConfirmationDialog'

type SyncState = {
  state: OfflineState
  syncing: boolean
  error: string
  setError: (value: string) => void
}
const SyncContext = createContext<SyncState | null>(null)

export function OfflineSync({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { translate } = useLanguage()
  const client = useQueryClient()
  const [state, setState] = useState<OfflineState>(emptyState)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    setState(emptyState())
    setError('')
    if (!user) return
    let disposed = false,
      working = false,
      lastRefresh = 0
    const read = async () => {
      try {
        const value = await readOfflineState(user.id)
        if (!disposed) setState(value)
      } catch {
        if (!disposed) setError(translate('offlineStorageError'))
      }
    }
    const run = async () => {
      if (working || !navigator.onLine || disposed) return
      working = true
      setSyncing(true)
      setError('')
      try {
        await syncOfflineLedger()
        lastRefresh = Date.now()
        if (!disposed) await client.invalidateQueries()
      } catch (err) {
        if (!disposed)
          setError(
            err instanceof Error ? err.message : translate('offlineSyncError'),
          )
      } finally {
        working = false
        if (!disposed) {
          setSyncing(false)
          await read()
        }
      }
    }
    const changed = () => {
      void read()
    }
    const requested = () => {
      void run()
    }
    const external = () => {
      void read()
      void client.invalidateQueries()
    }
    const focus = () => {
      if (Date.now() - lastRefresh > 30_000) void run()
    }
    const timer = window.setInterval(() => {
      void readOfflineState(user.id)
        .then((value) => {
          if (
            value.entries.some((entry) => !entry.rejected) ||
            Date.now() - lastRefresh > 5 * 60_000
          )
            void run()
        })
        .catch(() => {})
    }, 30_000)
    window.addEventListener('lista:offline-change', changed)
    window.addEventListener('lista:offline-external', external)
    window.addEventListener('offline', changed)
    window.addEventListener('lista:sync-request', requested)
    window.addEventListener('online', requested)
    window.addEventListener('focus', focus)
    void read()
    void run()
    return () => {
      disposed = true
      window.clearInterval(timer)
      window.removeEventListener('lista:offline-change', changed)
      window.removeEventListener('lista:offline-external', external)
      window.removeEventListener('offline', changed)
      window.removeEventListener('lista:sync-request', requested)
      window.removeEventListener('online', requested)
      window.removeEventListener('focus', focus)
    }
  }, [user?.id, client])

  return (
    <SyncContext.Provider value={{ state, syncing, error, setError }}>
      {children}
    </SyncContext.Provider>
  )
}

export function OfflineSyncButton() {
  const context = useContext(SyncContext)
  const { translate } = useLanguage()
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [remove, setRemove] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    else if (!open && dialog.current?.open) dialog.current?.close()
  }, [open])
  if (!context) return null
  const { state, syncing, error, setError } = context
  return (
    <>
      <button
        type="button"
        className="btn btn-outline relative shrink-0"
        title={translate('offlineSyncNow')}
        aria-label={translate('offlineSyncNow')}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon
          name="sync"
          className={`size-6 ${syncing ? 'animate-spin motion-reduce:animate-none' : ''}`}
        />
        {state.entries.length > 0 && (
          <span className="badge badge-primary absolute -right-2 -top-2">
            {state.entries.length}
          </span>
        )}
        {error && !state.entries.length && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 size-2 rounded-full bg-error"
          />
        )}
      </button>
      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby={titleId}
        onCancel={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false)
        }}
      >
        <div className="sync-modal modal-box bg-base-100" data-theme="lola">
          <header className="sync-modal-header">
            <h2 id={titleId} className="sync-modal-title">
              <Icon name="sync" className="size-6" />
              {translate('offlineDeviceData')}
            </h2>
            <button
              type="button"
              className="sync-modal-close btn btn-ghost"
              aria-label={translate('close')}
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </header>

          <div className="sync-modal-body">
            <div className="sync-modal-status">
              <div aria-live="polite">
                <p className="font-semibold">
                  {syncing
                    ? translate('offlineSyncing')
                    : state.entries.length
                      ? `${state.entries.length} ${translate('offlinePending')}`
                      : state.snapshot
                        ? translate('offlineReady')
                        : translate('offlinePreparing')}
                </p>
                {state.snapshot && (
                  <p className="mt-1 text-sm text-base-content/65">
                    <span className="block">
                      {translate('offlineLastSync')}
                    </span>
                    <time
                      className="block"
                      dateTime={state.snapshot.capturedAt}
                    >
                      {formatDate(state.snapshot.capturedAt)}
                      <span className="block">
                        {new Date(state.snapshot.capturedAt).toLocaleTimeString(
                          'en-PH',
                          { hour: '2-digit', minute: '2-digit' },
                        )}
                      </span>
                    </time>
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn btn-outline"
                disabled={syncing || !navigator.onLine}
                onClick={() =>
                  window.dispatchEvent(new Event('lista:sync-request'))
                }
              >
                {translate('offlineSyncNow')}
              </button>
            </div>
            {error && (
              <p role="alert" className="text-error break-words">
                {error}
              </p>
            )}
            {state.entries.length > 0 && (
              <details>
                <summary className="cursor-pointer font-semibold">
                  {translate('offlineReview')}
                </summary>
                <p className="mt-2 text-sm">{translate('offlineTentative')}</p>
                <ul className="mt-3 grid gap-3">
                  {state.entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="grid gap-2 rounded-box border border-base-300 p-3"
                    >
                      <p className="font-semibold">
                        {
                          state.snapshot?.customers.find(
                            (customer) => customer.id === entry.customerId,
                          )?.name
                        }
                      </p>
                      <p>
                        {translate(
                          entry.kind === 'debt'
                            ? 'debtAdded'
                            : 'paymentReceived',
                        )}
                      </p>
                      <p className="font-bold">
                        ₱{' '}
                        {entry.kind === 'debt'
                          ? draftDebt(entry).totalAmount
                          : (entry.body as PaymentInput).amount}
                      </p>
                      <span className="badge badge-outline">
                        {translate(
                          entry.receipt
                            ? 'offlineConfirmed'
                            : entry.rejected
                              ? 'offlineNeedsReview'
                              : 'offlinePendingLabel',
                        )}
                      </span>
                      {entry.error && (
                        <p className="text-error break-words">{entry.error}</p>
                      )}
                      {entry.rejected && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={syncing}
                          onClick={() =>
                            void retryEntry(entry.id).then(() =>
                              window.dispatchEvent(
                                new Event('lista:sync-request'),
                              ),
                            )
                          }
                        >
                          {translate('tryAgain')}
                        </button>
                      )}
                      {!entry.receipt &&
                        (!entry.attempted || entry.rejected) && (
                          <button
                            type="button"
                            className="btn btn-remove"
                            disabled={syncing}
                            onClick={() => setRemove(entry.id)}
                          >
                            {translate('offlineRemove')}
                          </button>
                        )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      </dialog>
      <ConfirmationDialog
        open={remove !== null}
        title={translate('offlineRemove')}
        description={translate('offlineRemoveDescription')}
        confirmLabel={translate('offlineRemove')}
        cancelLabel={translate('cancel')}
        pendingLabel={translate('saving')}
        isConfirming={false}
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (!remove) return
          void discardEntry(remove)
            .then(async () => {
              setRemove(null)
              await client.invalidateQueries()
            })
            .catch((err: Error) => {
              setRemove(null)
              setError(err.message)
            })
        }}
      />
    </>
  )
}
