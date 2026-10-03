/**
 * THE tenant-scoping helper (rule #2).
 *
 * Every business query must go through tenantScoped(tenantId). It returns a
 * Prisma client that automatically stamps `tenantId` into the WHERE clause of
 * every read/update/delete and into the `data` of every create. A business
 * route therefore CANNOT read or write another tenant's rows, even if the
 * developer forgets to add `tenantId` by hand.
 *
 * The one exception is the auth layer (login/register), which legitimately
 * looks up users BEFORE a tenant is known - that code uses the raw `db`
 * client from ./db.js and is loudly commented as such.
 */
import { db } from "./db.js";

export function tenantScoped(tenantId: string) {
  return db.$extends({
    query: {
      $allModels: {
        $allOperations({ operation, args, query }) {
          const a = args as {
            where?: unknown;
            data?: unknown;
            create?: unknown;
          };

          if (operation === "create") {
            // Single insert: stamp tenantId onto the row.
            a.data = { ...(a.data as object), tenantId };
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            // Bulk insert: stamp tenantId onto every row.
            a.data = (a.data as object[]).map((row) => ({ ...row, tenantId }));
          } else if (
            // These take a *unique* where ({ id }), where a tenantId can never be
            // AND'd on. Unscoped, they could read/change another tenant's row.
            // Rejecting them loudly turns a silent leak into a dev-time crash.
            operation === "findUnique" ||
            operation === "findUniqueOrThrow" ||
            operation === "upsert"
          ) {
            throw new Error(
              `tenantScoped(): ${operation}() accepts a unique where, so tenantId cannot be enforced - use findFirst() instead.`,
            );
          } else if (operation === "update" || operation === "delete") {
            // Same problem as above. The Many variants take a full where clause,
            // so they CAN be tenant-scoped (put the row's id inside `where`).
            throw new Error(
              `tenantScoped(): ${operation}() accepts a unique where, so tenantId cannot be enforced - use ${operation}Many() with { id } in the where clause instead.`,
            );
          } else {
            // Reads (find Many/First/count/aggregate) and updateMany/deleteMany
            // accept a real WhereInput: scope it with AND.
            if (a.create !== undefined) {
              a.create = { ...(a.create as object), tenantId };
            }
            a.where = { AND: [{ tenantId }, a.where ?? {}] };
          }

          return query(args);
        },
      },
    },
  });
}

export type TenantScopedClient = ReturnType<typeof tenantScoped>;