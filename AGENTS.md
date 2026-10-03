# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# NEVER RESET A REAL DATABASE

The production Postgres is Neon (see `server/.env`: `DATABASE_URL` for runtime,
`DIRECT_URL` for migrations).

**NEVER pass `DATABASE_URL` or `DIRECT_URL` to `--shadow-database-url`.** A shadow
database is a throwaway scratch DB: Prisma DROPS and recreates its schema. Passing a
real one destroys every row in production. This happened once on 2026-10-03 and it is
not to be repeated.

Safe way to add a migration:

1. Hand-write the DDL in `server/prisma/migrations/<timestamp>_<name>/migration.sql`
   (a `CREATE TABLE` + its indexes + FK is a few lines; copy the shape of the
   neighbouring migration files).
2. `npx prisma migrate deploy` — applies only pending migrations, never resets.
3. `npx prisma generate`.

If a shadow database is ever genuinely needed, point it at a dedicated throwaway
Neon *branch* that nothing else uses, and confirm with the user first.

Other hard rules for this repo's server:

- Write migration files as UTF-8 **without BOM** (a BOM makes `migrate deploy` fail
  with a confusing syntax error).
- PowerShell 5.1 `Get-Content`/`Set-Content` mangle non-ASCII text (`·`, `₦`, `—`).
  Use `[System.IO.File]::ReadAllText/WriteAllText` with an explicit UTF-8 encoding for
  any bulk edit of source files.