# Development Roadmap

## Phase 0 — Project discovery and planning

Status: complete

Objectives:

- inspect the repository and confirm starting state
- document business rules and user expectations
- finalize intended database architecture
- define the roadmap before major implementation begins

Deliverables:

- requirements.md
- database-design.md
- development-roadmap.md

The business model and financial rules were reviewed and approved before Phase 1 began.

## Phase 1 — Project foundation

Status: complete

Goals:

- initialize frontend and backend apps separately
- configure TypeScript, tooling, and package management
- configure Prisma and PostgreSQL
- set up environment variables and secrets handling
- establish frontend/backend communication contract
- create initial mobile-friendly app layout

Implementation tasks:

1. initialize Vite React + TypeScript frontend
2. initialize NestJS backend
3. configure Tailwind CSS
4. configure Prisma schema structure
5. add environment files for local development
6. confirm basic app routing and layout shell
7. organize frontend components using Atomic Design layers
8. organize backend code by feature modules and shared infrastructure
9. verify the frontend-to-backend health check

The initial Prisma schema is validated and the health endpoint is reachable through the frontend proxy. No database migration has been applied yet; applying the first migration requires a running PostgreSQL instance and a configured local `DATABASE_URL`.

## Phase 2 — Backend development

Status: API implementation and unit tests are in place. Database-backed verification is blocked until the local PostgreSQL credentials are corrected and the generated migration is applied.

Key implementation order:

1. authentication
2. customer management
3. money utang transactions
4. store items transactions
5. payment recording
6. payment allocation
7. balance calculations
8. reversals and voids
9. audit logging
10. category-separated balances and summary/customer/daily/monthly reports

Required testing:

- balance validation tests
- payment allocation tests
- over-allocation rejection tests
- transaction reversal tests
- audit log coverage

Current verification: 26 backend unit tests pass; the Prisma schema validates. The migration is generated but has not been applied.

## Phase 3 — Frontend development

Status: primary workflows are implemented with responsive DaisyUI screens and English/Tagalog translations. Customer profiles support archive/restore with confirmation; archived customers are visibly labeled and can be included in customer, payment, and history selection.

Key screens:

1. login screen
2. dashboard
3. customer list
4. customer profile
5. add money utang form
6. add store items utang form
7. record payment form
8. transaction history
9. reports

The frontend should prioritize:

- large readable labels
- simple mobile layout
- clear confirmation steps
- straightforward forms
- visible balance summaries

## Phase 4 — Integration

Status: login, customer, debt, payment, history, and report screens are connected to the API. Archive/restore actions preserve an audit trail, hide archived customers by default, and retain payment settlement and history access. Full database-backed end-to-end verification remains blocked by local database credentials.

Goals:

- connect frontend forms to backend APIs
- add loading and error states
- validate user input before submission
- prevent duplicate financial actions
- confirm displayed balances match backend truth

## Phase 5 — Testing with realistic scenarios

Status: 28 service-level backend tests pass, including customer archive/restore audit coverage. The complete customer/debt/payment/reversal scenario still needs a migrated, reachable database.

Recommended scenario flow:

1. create a customer
2. record money borrowed
3. record store credit
4. record a partial payment to one category
5. record a split payment across both categories
6. verify separate balances
7. verify combined balance
8. void or reverse an incorrect transaction
9. reverse incorrect payment
10. confirm audit history remains traceable

## Phase 6 — Deployment

Status: blocked pending a verified database and user-managed production hosting/secret access.

- configure production environment variables
- deploy frontend to Vercel
- deploy backend to Render
- provision managed PostgreSQL
- enable HTTPS
- configure backups
- run usability testing on Lola's actual device

## Phase 7 — Real-world improvements

Status: approved but not started; begin after the core is stable and database-backed scenarios pass. This gate remains in place so offline synchronization and inventory changes do not compound unverified ledger behavior.

After the base system is stable:

- offline queued entries
- synchronization
- printable statements
- QR-based customer lookup
- inventory management
- optional employee roles and permissions

## Recommended implementation sequence

For this project, the best path is:

1. complete Phase 0 sign-off
2. build schema and balance rules first
3. implement backend and tests
4. verify customer profile and balances
5. then build the frontend screens
6. integrate and validate against real scenarios

This sequence reduces the risk of creating a financially incorrect UI ahead of a proper backend model.
