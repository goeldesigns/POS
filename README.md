# Tabla — restaurant POS (web app)

Next.js 16 (App Router, React 19, TypeScript strict) · Tailwind CSS 4 · Radix UI · Recharts · Zod · React Hook Form · TanStack Query.

A public **landing page** (`/`) plus two apps: the **restaurant workspace** (`/app`) and the **Super Admin console** (`/super-admin`).

This repository is the **UI only**. It has no database access and no business rules of its own: every page and server action calls the Spring Boot backend (`POS-backend`) over HTTP, and the backend owns the schema, sessions, tenancy, pricing, stock, loyalty, audit and every other rule. The screens, texts and results are the same as before the split.

## How the UI talks to the backend

- **Server side (pages and server actions).** `src/server/backend/client.ts` forwards the visitor's session cookie (`tabla_session` or `tabla_admin_session`), `X-Forwarded-For` and `User-Agent` to the backend, unwraps the `{ data }` envelope and turns `{ error: { code, message, fieldErrors } }` into the same `AppError` the screens already render. Login, sign-up and logout relay the `Set-Cookie` the backend issues.
- **Context.** `src/server/auth/load-context.ts` builds the signed-in context from `GET /api/v1/auth/me` (restaurant session) or `GET /api/v1/admin/me` (Super Admin). Permissions, modules and plan flags come from the backend; the UI uses them to hide screens and buttons, and the backend enforces them again.
- **Adapters.** `src/server/services/*.ts` keep the function names and return shapes the pages were written against and make one API call each. `src/server/actions/*.ts` keep the Zod validation and the permission list of every server action, then call the API.
- **Browser.** Client components call `/api/v1/*` on this app's own origin (search, notifications, uploads, file downloads, CSV export, order drawer). In production nginx sends those paths to the backend; in development `next.config.ts` rewrites them to `BACKEND_URL`.

## Quick start (development)

```bash
npm install
cp .env.example .env     # BACKEND_URL points at the running Spring Boot backend
npm run dev              # http://localhost:3000
```

Start the backend first (see its README). `npm run typecheck` and `npm run build` must pass.

### Demo credentials (development only)

| Who | URL | Email | Password |
|---|---|---|---|
| Super Admin | `/super-admin/login` | admin@tabla.dev | Admin@12345 |
| Owner · Spice & Stone (Enterprise) | `/auth/login` | owner@spiceandstone.demo | Demo@1234 |
| Manager (2 restaurants → switcher) | | manager@spiceandstone.demo | Demo@1234 |
| Cashier (no inventory permission) | | cashier@spiceandstone.demo | Demo@1234 |
| Waiter / Kitchen / Accounts / Inventory | | waiter@ · kitchen@ · accounts@ · inventory@spiceandstone.demo | Demo@1234 |
| Café owner · The Brew Room (Professional) | | owner@brewroom.demo | Demo@1234 |
| Starter plan · Coastal Curry Co. | | owner@coastalcurry.demo | Demo@1234 |

The demo data is created by the backend's migrations and seed profile, not by this repository.

## Environment

| Variable | Purpose |
|---|---|
| `BACKEND_URL` | Base URL of the Spring Boot backend the server calls (default `http://127.0.0.1:8081`) |
| `APP_URL` | Public base URL of this app, used in shareable links such as webhook URLs |
| `DEMO_MODE` | `true` shows the demo-account helper and the aggregator sandbox outside development |

## Layout

```
src/lib/           permissions, pricing helpers, units, formatting, Zod schemas, enums
src/server/        backend client, auth context and guards, action wrappers, services/ (API adapters), actions/
src/components/    ui/ primitives, shell/, charts/, admin/ (console), landing/, feature components
src/app/           page.tsx (landing), auth/, app/ (restaurant), super-admin/ (console), print/
```

## Out of scope (by design)

Online ordering for diners, live Swiggy/Zomato partner APIs and an online payment gateway. The order API, API keys and subscription provider fields are in the backend for them.
