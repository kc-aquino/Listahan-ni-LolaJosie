# Deployment preparation

The application targets Vercel for the React frontend, Render for the NestJS API, and Neon for PostgreSQL. This guide does not contain production credentials.

## Neon PostgreSQL

1. The repository is linked to the existing Neon project and its `production` branch. Neon Postgres is provisioned automatically; no additional database service declaration is needed in `neon.ts`.
2. In the Neon Console, use **Connect** and select the intended branch, database, and role. Use the pooled URL (hostname contains `-pooler`) for application traffic and the direct URL (no `-pooler`) for Prisma migrations.
3. Configure both variables in Render's private API environment settings: `DATABASE_URL` for the pooled connection and `DATABASE_URL_UNPOOLED` for the direct connection. Never expose either URL in frontend settings, source control, or chat.
4. Apply migrations with `yarn db:migrate:deploy` from the backend service/release environment. Prisma is configured to run migrations through `DATABASE_URL_UNPOOLED`.
5. Before real financial records are entered, verify Neon backup/restore options for the selected plan and perform a restore check.

The linked Neon `production` branch has the initial Prisma migration applied. An owner account was seeded from the existing local `OWNER_*` settings; configure a new, unique production owner password before public launch if those are not the credentials you intend to use.

## Vercel frontend

Create a Vercel project with the repository's `frontend` directory as its root. The build command is `npm run build`, and the output directory is `dist`. `frontend/vercel.json` sends client-side routes to the React entry point.

Set this environment variable for the Vercel production environment:

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://<your-render-api-host>/api` |

Vite embeds `VITE_*` values into the browser bundle at build time. Set the value before deploying and redeploy after changing it. Keep secrets out of all `VITE_*` variables.

## Render API

Create a Render web service using the `backend` directory as its root. Use the repository's Node.js-compatible Yarn setup, build with `yarn install --ignore-engines && yarn prisma:generate && yarn build`, and start with `yarn start:prod`. Configure the following values in the Render service's private environment settings:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon pooled PostgreSQL connection URL for API traffic |
| `DATABASE_URL_UNPOOLED` | Neon direct PostgreSQL connection URL for Prisma migrations |
| `JWT_SECRET` | Random private signing key, at least 32 characters |
| `OWNER_NAME` | Owner display name for the initial account |
| `OWNER_USERNAME` | Private owner sign-in name |
| `OWNER_PASSWORD` | Unique initial owner password (12+ characters, no more than 72 UTF-8 bytes) |
| `FRONTEND_URL` | Exact deployed Vercel origin, for example `https://your-app.vercel.app` |

Render supplies `PORT`. The API listens on it and exposes `GET /api/health`.

For a new environment, run `yarn db:migrate:deploy` against its Neon branch, then run `yarn prisma:seed:owner` once using the intended owner credentials. Do this from a trusted provider shell or release job; do not copy production credentials into a local file or chat. Confirm backups and a restore procedure before entering real financial records.

## Release checks

- Verify the Vercel URL and API URL use HTTPS.
- Confirm `VITE_API_BASE_URL` points to the deployed API `/api` path and `FRONTEND_URL` exactly matches the deployed frontend origin.
- Verify API health, owner login, customer creation, debt entry, payment allocation, and reversals.
- Confirm database backups and test recovery before using the live system.
- Test usability on Lola's phone or tablet before launch.

Production service creation, credentials, database region/plan, and backups remain under the user's hosting accounts and control.
