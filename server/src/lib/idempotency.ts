import { TenantScopedClient } from "./scoped.js";

export type ScopedTx = Parameters<Parameters<TenantScopedClient["$transaction"]>[0]>[0];

// Run a write exactly once per (tenant, idempotencyKey).
//
// Offline phones resend mutations after reconnecting. Without this, a sale
// whose request reached the server but whose response was lost in the dark
// would be applied TWICE - a broken ledger. With it, the FIRST run executes the
// handler and stores `key -> response` in idempotency_records; every re-send
// with the same key returns the stored response and changes nothing.
//
// The record is written inside the SAME transaction as the business rows, and
// tenantId is stamped/scoped on it like any other row (rule #2), so there is
// no cross-tenant replay risk.
export async function runIdempotent<T>(
  scoped: TenantScopedClient,
  tenantId: string,
  idempotencyKey: string | undefined,
  method: string,
  path: string,
  handler: (tx: ScopedTx) => Promise<T>,
): Promise<T> {
  if (!idempotencyKey) return handler(scoped as unknown as ScopedTx);

  const existing = await scoped.idempotencyRecord.findFirst({
    where: { tenantId, idempotencyKey },
  });
  if (existing) return JSON.parse(existing.responseJson) as T;

  let result!: T;
  await scoped.$transaction(async (tx) => {
    result = await handler(tx);
    await tx.idempotencyRecord.create({
      data: {
        tenantId,
        idempotencyKey,
        method,
        path,
        responseJson: JSON.stringify(result),
      },
    });
  });
  return result;
}