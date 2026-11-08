# Vercel services deployment

The repository root `vercel.json` defines one project with a NestJS `backend`
and Vite `frontend`. Neon continues to host PostgreSQL. Render and Neon Functions
are not used for this deployment.

## Routing and service calls

- `/api` and `/api/*` route publicly to `backend`, preserving the `/api` prefix.
- All other paths route publicly to `frontend`; its service-level SPA rewrite
  serves `index.html` for client-side navigation.
- Browser API calls use relative `/api` URLs, including preview deployments.
- There are no server-to-server service calls. The Vite frontend produces static
  browser assets, so it cannot read runtime service bindings. No bindings are
  declared. Neon is an external database, configured with `DATABASE_URL`, not a
  Vercel service binding.

## Project setup

Import the repository as **one project**, with Root Directory set to the
repository root (`.`), not `frontend` or `backend`. Use Node.js 24.x. Remove any
old dashboard overrides for framework, build, install, or output settings and let
`vercel.json` supply service-specific settings. Backend installation uses the
existing Yarn lockfile; its npm lockfile is outdated. The build generates Prisma
for the build platform, then compiles NestJS. Database migration and owner seeding
are separate release operations, never automatic preview-build steps.

## Environment variables

Set `DATABASE_URL` (Neon pooled), `DATABASE_URL_UNPOOLED` (direct migration URL),
and `JWT_SECRET` (random, at least 32 characters) privately in Vercel.
`FRONTEND_URL` is optional for this same-origin setup; set it to the exact public
origin if allowing a separate browser origin. Never prefix secrets with `VITE_`.
`VITE_API_BASE_URL` is no longer used; remove old hosting URL values from Vercel.

Use a separate Neon branch for previews; do not point writable preview deployments
at the production database. Run migrations from a trusted environment with the
intended branch's direct URL. The existing production owner is retained; do not
rerun the seed unless deliberately provisioning or changing that account.

## Verification and release

Run `vercel dev` from the repository root with a current authenticated Vercel CLI.
Check `/api/health`, sign-in, client-side routes, customer creation, money and item
debts, partial and full payments, history filters, completed debts, and reversals.
Check that `/api/unknown` returns an API 404 rather than the frontend HTML.

Local release checks on November 08, 2026 passed before the hosting change:
frontend/backend builds, 28 backend unit tests, 8 frontend tests, backend lint,
Prisma validation, and 2 database-backed e2e tests. Vercel services integration,
backup/restore verification and actual-device acceptance remain pending.
Live production HTTPS and API checks are recorded below. Do not describe the release as deployed until verified live.

Before deployment, confirm service names, public paths, and the absence of internal
bindings with the user. After confirmation, deploy a preview, verify it, then
promote the reviewed release. Confirm database recovery and Lola's actual device
workflow before relying on live financial records.

## Production release — November 08, 2026

- App: https://listahan-ni-lolajosie.vercel.app
- Vercel project: `listahan-ni-lolajosie`, repository root `.`.
- Verified deployment: `dpl_6d2Myd9C6Z3TbZmVudSwwwMg5aQb`.
- Both services use Node.js 24 via package engine constraints.
- Production database URLs and JWT signing key are private Vercel secrets.
  `backend/.env` remains local and is excluded from uploads with `.vercelignore`.
- Production was promoted only after API health, owner sign-in, authenticated
  customer reads, and balance report reads passed. Smoke checks did not change
  financial records. Direct public-domain checks returned 200 for `/` and
  `/history`, 200 JSON for `/api/health`, 401 JSON for unauthenticated
  `/api/customers`, and 404 JSON for `/api/unknown`. The browser sign-in page loads.
- The confirmed route ownership remains frontend at non-API paths and backend at
  `/api` and `/api/*`, with no internal bindings.
- The NestJS service explicitly sets `entrypoint: src/main.ts` and
  `outputDirectory: .` to avoid a Vercel Services ESM output-layout issue.
  Its bootstrap is launched without top-level await, matching Vercel's NestJS
  runtime lifecycle. Keep root and backend package module modes consistent.
- This release was uploaded with the CLI from the local checkout; Git automatic
  deployments are not configured. Uncommitted source changes remain local.
- Vercel CLI created its automation protection bypass for authenticated deployment
  checks. The main production domain was also checked directly without that bypass.

Remaining Phase 6 work: test on Lola's actual device and verify the selected Neon
backup/recovery procedure. Avoid running the production owner seed routinely:
that command updates the existing owner's password.

## PWA and offline ledger

The frontend generates `/manifest.webmanifest`, `/sw.js`, static app-shell caches,
and home-screen icons using `vite-plugin-pwa`. Install in supporting browsers or
use Safari Share > Add to Home Screen. Updates are prompted rather than forced.

After online sign-in, the app prepares a complete customer/debt/payment snapshot
in per-owner IndexedDB storage. Wait for "Records available offline" before
relying on it offline. The session persists across app restarts; passwords are
never stored. If the server session expires, reconnect and sign in to resume sync.
Sign-out clears the active session/query data but retains the same owner's pending
entries so they can be recovered after that owner signs back in.

Offline users can browse saved customers, balances, history, and item suggestions,
and record debts/payments for those customers. Entries are stored durably before
showing success, including their original transaction timestamps. Pending payments
against newly created offline debts are supported. Pending entries and affected
balances are visibly marked. New customers, archive/restore, voids, and reversals
require a connection. Date-range reports are available offline only if loaded
beforehand; they show their last server results. Dashboard/customer balances
include tentative pending entries.

When the app is open, sync runs on reconnect, app focus, and retries pending work
periodically. Reopening the installed app also resumes it. Closed-app background
sync is not promised. Sync sends debts before dependent payments with fixed
idempotency keys, persists acknowledgments, maps local debt IDs to server IDs,
then atomically replaces the snapshot and removes confirmed queue entries.
Web Locks coordinate tabs; server idempotency prevents duplicates even if a
response is lost or several tabs retry. Completed idempotency records are replayed
even beyond their original 24-hour expiry, preventing delayed offline duplicates.

Server rejections remain visible for review and block later queue processing.
Users can retry or remove a definitively rejected/never-sent entry. Ambiguous
in-flight entries cannot be discarded until the server outcome is known, and a
pending debt cannot be removed before its dependent payment. No financial records
are changed merely by dismissing UI. Server-side balances and validation remain
authoritative when reconciling conflicts.

The service worker caches static files only; `/api` and `/api/*` bypass it.
Financial snapshots/outbox live in application-managed IndexedDB, not Workbox.
Storage failures are surfaced and never reported as saved entries. Offline
functionality depends on this browser/device retaining its site storage.

Validation includes generated-manifest/icon/worker tests, IndexedDB persistence,
ordered debt/payment sync, lost-response retry, conflict preservation, account
isolation, over-allocation rejection, and expired-key replay tests. Actual-device
installation and offline acceptance remain part of the release checklist.

Offline PWA release deployed and promoted on November 08, 2026:
`dpl_DbYo3BgrEV1tH1HKShaC97EGbhdn` at https://listahan-ni-lolajosie.vercel.app.
Production checks passed for manifest metadata, all manifest icons, Apple touch
icon markup, service-worker MIME/no-cache headers, network-only API routing,
API health, and browser page loading. Both database-backed financial e2e tests
passed after the delayed-idempotency change. Offline persistence/retry/conflict
cases were exercised with IndexedDB emulation; actual phone installation and
Wi-Fi-toggle acceptance still need to be checked on Lola's device.

## Online-first saving and History sync controls

Sync status and manual controls are in a modal opened from the icon beside the
History heading. The global sync provider is headless: reconnect synchronization
continues on all screens even when the modal is closed.

Connected debt/payment saves now wait for the API response and return the server
record directly. Only offline writes or uncertain network deliveries enter the
local outbox. Online validation errors are shown immediately. Fixed request
bodies/timestamps and idempotency keys are preserved on fallback. Reconnect sync
submits pending entries and refreshes the local snapshot from current server data;
it never replaces the server ledger with an old device snapshot.
