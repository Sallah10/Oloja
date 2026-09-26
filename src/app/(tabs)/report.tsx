import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, View } from "react-native";

import { AmountText } from "@/components/ui/amount-text";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Screen } from "@/components/ui/screen";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { Text as T } from "@/components/ui/text";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import {
  biggestDebtor,
  monthStory,
  slowMovers,
  stockCounts,
  topDebtors,
  totalOwed,
  type MonthStory,
} from "@/lib/insights";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/cn";
import { CustomerSummary, ProductSummary, TransactionSummary } from "@/lib/types";

/**
 * The fifth tab: the month as one clear story. What sold, what made a real
 * margin, what's parked on the shelf, and who still owes you. Read-only, built
 * entirely from the same insights the other tabs tell.
 */
export default function ReportScreen() {
  const router = useRouter();
  const { tenant } = useAuth();

  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: () => api<{ products: ProductSummary[] }>("/api/products"),
  });
  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => api<{ customers: CustomerSummary[] }>("/api/customers"),
  });
  const transactionsQuery = useQuery({
    queryKey: ["transactions"],
    queryFn: () => api<{ transactions: TransactionSummary[] }>("/api/transactions"),
  });

  const products = useMemo(() => productsQuery.data?.products ?? [], [productsQuery.data]);
  const customers = useMemo(() => customersQuery.data?.customers ?? [], [customersQuery.data]);
  const transactions = useMemo(
    () => transactionsQuery.data?.transactions ?? [],
    [transactionsQuery.data],
  );

  const month = useMemo(() => monthStory(transactions, products), [transactions, products]);
  const stock = useMemo(() => stockCounts(products), [products]);
  const owed = useMemo(() => totalOwed(customers), [customers]);
  const owedCount = customers.filter((c) => c.debtMinor > 0).length;
  const movers = useMemo(() => slowMovers(transactions, products), [transactions, products]);
  const debtors = useMemo(() => topDebtors(customers), [customers]);
  const topDebtor = biggestDebtor(customers);

  const idle = !productsQuery.isLoading && products.length === 0 && transactions.length === 0;

  return (
    <Screen scroll>
      <ScreenHeader
        eyebrow={`Report · ${tenant?.name ?? ""}`}
        title="Your month"
        subtitle={`The ledger's view of ${month.label}: what sold, what's left, and who still owes.`}
      />

      <View className="mt-5">
        <View className="rounded-3xl border border-accent-deep bg-accent-deep px-5 py-5 shadow-soft">
          <View className="flex-row items-center justify-between">
            <T weight="semibold" className="text-[11px] uppercase tracking-[1.6px] text-white/60">
              {month.label}
            </T>
            <View className="rounded-full bg-white/15 px-2.5 py-1">
              <T weight="semibold" className="text-xs text-white">
                {month.sales.count} sale{month.sales.count === 1 ? "" : "s"}
              </T>
            </View>
          </View>
          <AmountText amount={month.sales.amountMinor} tone="hero" size="2xl" className="mt-3" />
          <T className="mt-1 text-sm text-white/70">
            {month.sales.count === 0
              ? "Nothing recorded yet this month"
              : `${month.sales.count} sale${month.sales.count === 1 ? "" : "s"} · average ${formatMoney(Math.round(month.sales.amountMinor / month.sales.count))}`}
          </T>

          {month.sales.amountMinor > 0 ? (
            <View className="mt-4 border-t border-white/15 pt-3">
              <View className="h-2 flex-row overflow-hidden rounded-full bg-white/10">
                <View className="bg-white/75" style={{ width: `${(100 * month.creditMinor) / month.sales.amountMinor}%` }} />
                <View className="flex-1 bg-white/25" />
              </View>
              <View className="mt-2 flex-row justify-between">
                <T className="text-xs text-white/60">
                  Cash {formatMoney(month.sales.amountMinor - month.creditMinor)}
                </T>
                <T className="text-xs text-white/60">On credit {formatMoney(month.creditMinor)}</T>
              </View>
              {month.paymentsMinor > 0 ? (
                <T className="mt-2 text-xs text-white/50">
                  Debts settled this month · {formatMoney(month.paymentsMinor)}
                </T>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      <DayBars days={month.days} bestDayLabel={month.bestDay?.label ?? null} />

      <View className="mt-4 flex-row gap-3">
        <View className="flex-1">
          <Card flat className="px-4 py-3.5">
            <T className="text-xs text-ink-faint">Profit so far</T>
            <AmountText amount={month.profitKnownMinor} size="lg" className="mt-1" />
            <T className="mt-1 text-xs leading-4 text-ink-soft">
              {month.unknownCostSaleCount > 0
                ? `${month.unknownCostSaleCount} sale${month.unknownCostSaleCount === 1 ? "" : "s"} without a cost not counted`
                : month.sales.count === 0
                  ? "Record sales and this fills in"
                  : "on items with a cost recorded"}
            </T>
          </Card>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate("/customers")}
          className="flex-1 active:opacity-80">
          <Card flat className="px-4 py-3.5">
            <T className="text-xs text-ink-faint">Still owed</T>
            <AmountText amount={owed} size="lg" className="mt-1" />
            <T className="mt-1 text-xs leading-4 text-ink-soft">
              {owed === 0 ? "everyone is paid up" : `${owedCount} customer${owedCount === 1 ? "" : "s"} owe you`}
            </T>
          </Card>
        </Pressable>
      </View>

      <View className="mt-3 flex-row gap-3">
        <Card flat className="flex-1 flex-row items-center gap-2.5 px-4 py-3">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-tint">
            <Ionicons name="trending-up" size={16} color="#1F5D3C" />
          </View>
          <View className="flex-1">
            <T className="text-[11px] uppercase tracking-wide text-ink-faint">Best day</T>
            <T weight="semibold" className="text-sm leading-5 text-ink" numberOfLines={1}>
              {month.bestDay
                ? `${month.bestDay.label} · ${formatMoney(month.bestDay.amountMinor)}`
                : "No sales yet"}
            </T>
          </View>
        </Card>
        <Card flat className="flex-1 flex-row items-center gap-2.5 px-4 py-3">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-gold-tint">
            <Ionicons name="moon-outline" size={16} color="#B98A2F" />
          </View>
          <View className="flex-1">
            <T className="text-[11px] uppercase tracking-wide text-ink-faint">Quiet days</T>
            <T weight="semibold" className="text-sm leading-5 text-ink" numberOfLines={1}>
              {month.quietDays} so far
            </T>
          </View>
        </Card>
      </View>

      {idle ? (
        <Card className="mt-6 p-4">
          <T className="text-sm leading-5 text-ink-soft">
            This report starts empty the same way the ledger does. Add a few products and record a
            first sale, and next month it tells the whole story on its own.
          </T>
        </Card>
      ) : (
        <>
          <View className="mt-6">
            <SectionHeader title="Shelf health" className="mb-2.5" />
            <Pressable accessibilityRole="button" onPress={() => router.navigate("/inventory")} className="active:opacity-80">
              <Card className="px-4 py-4">
                <View className="flex-row justify-between gap-3">
                  <ShelfStat label="On hand" value={String(stock.onHand)} tone="accent" />
                  <ShelfStat label="Running low" value={String(stock.low)} tone="gold" />
                  <ShelfStat label="Out of stock" value={String(stock.out)} tone="danger" />
                </View>
                {stock.low + stock.out > 0 ? (
                  <T className="mt-3 border-t border-line pt-3 text-xs leading-4 text-ink-soft">
                    The low ones below their alert level are on the Stock tab, ready to restock.
                  </T>
                ) : null}
              </Card>
            </Pressable>
          </View>

          <View className="mt-6">
            <SectionHeader title="Money parked on the shelf" className="mb-2.5" />
            {movers.length === 0 ? (
              <Card className="flex-row items-center gap-3 px-4 py-3.5">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent-tint">
                  <Ionicons name="checkmark" size={18} color="#1F5D3C" />
                </View>
                <T className="flex-1 text-sm leading-5 text-ink-soft">
                  Everything you stock has sold in the last two weeks.
                </T>
              </Card>
            ) : (
              <View className="gap-2">
                {movers.map((m, index) => (
                  <Card key={m.name} className="flex-row items-center gap-3 px-4 py-3">
                    <View
                      className={
                        index === 0
                          ? "h-9 w-9 items-center justify-center rounded-xl bg-gold-tint"
                          : "h-9 w-9 items-center justify-center rounded-xl bg-paper"
                      }>
                      <Ionicons
                        name={index === 0 ? "leaf-outline" : "bed-outline"}
                        size={17}
                        color={index === 0 ? "#B98A2F" : "#B3A78D"}
                      />
                    </View>
                    <View className="min-w-0 flex-1">
                      <T weight="semibold" className="text-[15px] text-ink" numberOfLines={1}>
                        {m.name}
                      </T>
                      <T className="mt-0.5 text-xs text-ink-soft">
                        {m.lastSaleAt ? `Last sold ${formatDateTime(m.lastSaleAt)}` : "Never sold yet"}
                      </T>
                    </View>
                    <T weight="semibold" className="text-sm tabular-nums text-ink">
                      {m.stockQty} {m.stockQty === 1 ? "unit" : "units"}
                    </T>
                  </Card>
                ))}
              </View>
            )}
          </View>

          <View className="mt-6">
            <SectionHeader title="Who still owes" className="mb-2.5" />
            {topDebtor ? (
              <View className="gap-2.5">
                {debtors.map((c) => (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/customer/${c.id}`)}
                    className="active:opacity-80">
                    <Card className="flex-row items-center gap-3 px-4 py-3">
                      <Avatar name={c.name} />
                      <View className="min-w-0 flex-1">
                        <T weight="semibold" className="text-[15px] text-ink" numberOfLines={1}>
                          {c.name}
                        </T>
                        <T className="mt-0.5 text-xs text-ink-soft">
                          {topDebtor.id === c.id ? "owes the most" : "on the books"}
                        </T>
                      </View>
                      <AmountText amount={c.debtMinor} tone="debt" size="sm" />
                    </Card>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Card className="flex-row items-center gap-3 px-4 py-3.5">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent-tint">
                  <Ionicons name="shield-checkmark-outline" size={18} color="#1F5D3C" />
                </View>
                <T className="flex-1 text-sm leading-5 text-ink-soft">
                  Nobody owes you money right now - the books are clean.
                </T>
              </Card>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

function ShelfStat({ label, value, tone }: { label: string; value: string; tone: "accent" | "gold" | "danger" }) {
  const color =
    tone === "danger" ? "#AC4431" : tone === "gold" ? "#B98A2F" : "#1F5D3C";
  return (
    <View className="flex-1 items-center">
      <T weight="bold" className="text-2xl tabular-nums tracking-tight" style={{ color }}>
        {value}
      </T>
      <T className="mt-0.5 text-center text-[11px] leading-4 text-ink-soft">{label}</T>
    </View>
  );
}

/**
 * The month's sales as plain flexbox bars - one per day so far. Zero days stay
 * as a faint stub (they're the quiet days) and the best day stands in gold.
 * No chart library: flexbox rows keep this working on web and native alike.
 */
function DayBars({ days, bestDayLabel }: { days: MonthStory["days"]; bestDayLabel?: string | null }) {
  const max = Math.max(1, ...days.map((d) => d.amountMinor));
  const bestValue = Math.max(0, ...days.map((d) => d.amountMinor));
  const first = days[0]?.label ?? "";
  const last = days[days.length - 1]?.label ?? "";

  return (
    <Card className="mt-4 p-4">
      <View className="flex-row items-center justify-between">
        <T weight="semibold" className="text-base text-ink">
          Sales through the month
        </T>
        <T className="text-xs text-ink-faint">
          {days.length} day{days.length === 1 ? "" : "s"} so far
        </T>
      </View>
      <View className="mt-3 h-[110px] flex-row items-end gap-[2px]">
        {days.map((d) => {
          const pct = d.amountMinor === 0 ? 3 : Math.max(8, Math.round((d.amountMinor / max) * 100));
          return (
            <View key={d.label} className="flex-1 h-full items-center justify-end">
              <View
                className={cn(
                  "w-full rounded-t-[3px]",
                  bestValue > 0 && d.amountMinor === bestValue ? "bg-gold" : "bg-accent",
                  d.amountMinor === 0 && "opacity-25",
                )}
                style={{ height: `${pct}%`, minHeight: 3 }}
              />
            </View>
          );
        })}
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <T className="text-[10px] text-ink-faint">{first}</T>
        <View className="flex-row items-center gap-2">
          {bestDayLabel ? (
            <View className="flex-row items-center gap-1">
              <View className="h-2 w-2 rounded-full bg-gold" />
              <T className="text-[10px] text-ink-faint">{bestDayLabel}</T>
            </View>
          ) : null}
        </View>
        <T className="text-[10px] text-ink-faint">{last}</T>
      </View>
    </Card>
  );
}