import { tenantScoped } from "./scoped.js";

// What a customer currently owes == SUM of every debt_ledger entry. The ledger
// is append-only (CREDIT adds, PAYMENT subtracts), so we never store a mutable
// balance that can drift out of sync with the paper trail.
export async function debtBalance(
  scoped: ReturnType<typeof tenantScoped>,
  customerId: string,
): Promise<number> {
  const agg = await scoped.debtEntry.aggregate({
    where: { customerId },
    _sum: { amountMinor: true },
  });
  return agg._sum.amountMinor ?? 0;
}