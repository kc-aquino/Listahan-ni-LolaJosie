# Lista ni Lola

A mobile-first sari-sari store debt-management app designed around Lola Josie's daily workflow. Money Utang and Store Items Utang stay separate, with customer profiles and payments designed to retain a clear history.

## Project structure

```text
├── frontend/                 # React, TypeScript, Vite, Tailwind
│   └── src/
│       ├── app/               # Routing and app-wide providers
│       ├── components/
│       │   ├── atoms/         # Small reusable UI primitives
│       │   ├── molecules/     # Combinations of atoms
│       │   ├── organisms/     # Complete interface sections
│       │   └── templates/     # Shared page layouts
│       ├── lib/               # API client and shared utilities
│       ├── pages/             # Route-level screens
│       └── app.css            # Tailwind CSS and DaisyUI setup
├── backend/                  # NestJS REST API
│   ├── prisma/                # PostgreSQL schema and migrations
│   ├── src/
│   │   ├── modules/           # Feature modules (health, customers, etc.)
│   │   └── prisma/            # Shared Prisma service
│   └── test/
└── docs/                      # Requirements, database design, roadmap
```

The frontend follows Atomic Design for presentation components and uses DaisyUI on Tailwind CSS for its UI components. Route screens live in `pages/`, while application routing, language state, and shared providers live in `app/`. The backend is organized by feature module, with controllers, services, and DTOs kept together as each feature is added.

## Phase 1 foundation

The initial foundation includes the React app shell, responsive navigation and welcome screen, React Query setup, a Vite `/api` proxy, NestJS validation/CORS configuration, a health endpoint, and the initial Prisma/PostgreSQL schema.

## Current workflows

The app now includes owner sign-in, customer search/create/profile, archive/restore with retained history, separate debt entry forms, explicit split-payment allocation, transaction/payment history, reversals, and daily/monthly reports. Archived customers are hidden by default but can be included for lookup or payment settlement. Backend unit tests cover decimal balances, payment allocation, audit entries, idempotent writes, archive/restore audit events, and historical report snapshots. These workflows require the PostgreSQL migration and a seeded owner account before they can be used end to end.

## Language and UI

The English/Tagalog switch is in the top-right of the app header. The app starts in Tagalog, remembers the selected language in browser storage, and updates the page language for assistive technology. DaisyUI components and Tailwind utility classes are configured in `frontend/src/app.css`.

## Run locally

Use Node.js 22.22.3 or newer for a normal NestJS dependency install. If you are staying on Node.js 22.17.1, use `yarn install --ignore-engines` because the Nest development toolchain declares a newer Node minimum.

### Backend

```powershell
cd backend
yarn install --ignore-engines
Copy-Item .env.example .env
yarn prisma:generate
yarn db:migrate:deploy
yarn prisma:seed:owner
yarn start:dev
```

Before starting, edit `backend/.env` with a reachable PostgreSQL `DATABASE_URL`, a unique `JWT_SECRET` of at least 32 characters, and private owner account values (`OWNER_NAME`, `OWNER_USERNAME`, `OWNER_PASSWORD`). Generate a JWT secret locally with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Do not share or commit `.env`. The migration and owner seed require the database to be running and the local credentials to be valid. The API listens on `http://localhost:3000`; its liveness endpoint is `http://localhost:3000/api/health`.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

The Vite development server proxies `/api` requests to the backend on port 3000.

## Planning documents

- [Requirements](./docs/requirements.md)
- [Database design](./docs/database-design.md)
- [Development roadmap](./docs/development-roadmap.md)
