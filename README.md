# Oloja

A quiet ledger for small shops. Record sales (cash or on credit), track who owes you, watch stock,
and restock or adjust it when the supplier knocks. Works offline on the shop floor and syncs when
the phone finds a connection.

## Stack

- **App** - Expo SDK 57 (React Native 0.86, TypeScript), expo-router file-based routing in `src/app`,
  NativeWind/Tailwind styling, TanStack Query, SQLite-backed offline mirror + outbox (`src/lib/offline.ts`).
- **Server** - Express (TypeScript, ESM) in `server/`, Prisma + PostgreSQL. Multi-shop accounts
  with OWNER / STAFF / VIEW roles, one-time invite codes, and idempotent mutations.

## Repository layout

```
src/
  app/            routes (screens) + root layout
  components/     shared UI (buttons, fields, tabs, sync banner)
  context/        auth session state
  lib/            api client, offline mirror/outbox, mock API, money/time helpers
  constants/      theme tokens
server/
  src/routes/     Express routers (auth, products, customers, sales, invites)
  src/lib/        db, password, tokens, tenant scoping, idempotency
  prisma/         schema + migrations
```

## Getting started

The app talks to the API in two ways:

- **Demo mode** (default): `EXPO_PUBLIC_USE_MOCK_API=true`. Every request is answered with local
  fake data (`src/lib/mock-api.ts`), so the whole app is clickable without a server.
- **Real API**: set `EXPO_PUBLIC_USE_MOCK_API=false` and point `EXPO_PUBLIC_API_URL` at a running
  server (copy `.env.example` to `.env`). Web falls back to `http://localhost:4000`.

### App

```bash
npm install
npx expo start        # scan the QR code with Expo Go
```

### Server

```bash
cd server
npm install
cp .env.example .env  # fill in real Neon DATABASE_URL (pooler) + DIRECT_URL (plain host)
npx prisma migrate deploy
npm run dev           # http://localhost:4000
```

## Useful scripts

| Command                | Where  | What it does                           |
| ---------------------- | ------ | -------------------------------------- |
| `npx expo start`       | root   | dev server for the app                 |
| `npm run lint`         | root   | ESLint for the app                     |
| `npx tsc --noEmit`     | root   | type-check the app                     |
| `npm run dev`          | server | API dev server (watch mode)            |
| `npm run typecheck`    | server | type-check the API                     |
| `npm run db:migrate`   | server | `prisma migrate dev`                   |
| `npm run scope:check`  | server | tenant-isolation regression checks     |
| `npm run phase6:check` | server | multi-shop / invites regression checks |

## Feature notes

- **Offline first**: list reads fall back to the local mirror, and sales / payments / restock /
  adjustments queue in the outbox and replay when a connection returns (deduped by idempotency key).
  Creating or editing products/customers still needs a connection (a deliberate v1 boundary).
- **Multi-shop accounts**: one account can belong to many shops. Owners generate invite codes;
  members join via `Shops → Join a shop with a code`, then switch between shops in settings.
- **Stock ledger**: movements are append-only - a wrong count is fixed with a new ADJUST entry,
  never edited.
- **Security model**: all business queries run through tenant scoping; sessions are hashed server-side;
  mutations carry idempotency keys to survive replays.
