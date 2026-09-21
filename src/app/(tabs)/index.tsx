import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { AmountText } from "@/components/ui/amount-text";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { OnboardingChecklist, OnboardingStep } from "@/components/ui/onboarding-checklist";
import { Screen } from "@/components/ui/screen";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import {
  biggestDebtor,
  salesThisWeek,
  salesToday,
  stockCounts,
  topProductThisWeek,
  totalOwed,
} from "@/lib/insights";
import { formatMoney } from "@/lib/money";
import { greeting } from "@/lib/time";
import { CustomerSummary, ProductSummary, TransactionSummary } from "@/lib/types";

export default function DashboardScreen() {
  const router = useRouter();
  const { tenant, user, canTransact } = useAuth();

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

  const products = productsQuery.data?.products ?? [];
  const customers = customersQuery.data?.customers ?? [];
  const transactions = transactionsQuery.data?.transactions ?? [];

  const today = salesToday(transactions);
  const week = salesThisWeek(transactions);
  const owed = totalOwed(customers);
  const owedCount = customers.filter((c) => c.debtMinor > 0).length;
  const stock = stockCounts(products);
  const top = topProductThisWeek(transactions, products);
  const debtor = biggestDebtor(customers);

  const firstName = user?.name?.split(/\s+/)[0] ?? "there";
  const dateLabel = new Date().toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const steps: OnboardingStep[] = [
    {
      key: "products",
      title: "Add your first products",
      hint: "The goods you sell - give each a price.",
      done: products.length > 0,
    },
    {
      key: "sale",
      title: "Record your first sale",
      hint: "Cash or on credit - the ledger takes it from here.",
      done: transactions.length > 0,
      disabled: products.length === 0 && transactions.length === 0,
    },
    {
      key: "customer",
      title: "Add a customer",
      hint: "Someone who buys on credit gets a page of their own.",
      done: customers.length > 0,
    },
  ];
  const onboardingOpen = steps.some((s) => !s.done);

  const open = (path: "/sales" | "/customers" | "/inventory") =>
    router.navigate({ pathname: path, params: { new: "1" } });

  return (
    <Screen scroll>
      <ScreenHeader
        eyebrow={tenant?.name?.toUpperCase()}
        title={`${greeting()}, ${firstName}`}
        subtitle={dateLabel}
        className="mt-1"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Shop settings"
            onPress={() => router.push("/settings")}
            className="h-11 w-11 items-center justify-center rounded-full border border-line bg-paper-card active:opacity-70">
            <Ionicons name="settings-outline" size={20} color="#1F5D3C" />
          </Pressable>
        }
      />

      <View className="mt-5">
        <View className="rounded-3xl border border-accent-deep bg-accent-deep px-5 py-5 shadow-soft">
          <View className="flex-row items-center justify-between">
            <Text weight="semibold" className="text-[11px] uppercase tracking-[1.6px] text-white/60">
              Today
            </Text>
            {canTransact ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => open("/sales")}
                className="flex-row items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 active:opacity-75">
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text weight="semibold" className="text-xs text-white">
                  Record a sale
                </Text>
              </Pressable>
            ) : (
              <Badge tone="ink" label="View only" />
            )}
          </View>

          <AmountText amount={today.amountMinor} tone="hero" size="2xl" className="mt-3" />

          <Text className="mt-1 text-sm text-white/70">
            {today.count === 0
              ? "No sales yet today"
              : `${today.count} sale${today.count === 1 ? "" : "s"} today · ${today.creditCount} on credit`}
          </Text>

          {week.count > 0 ? (
            <View className="mt-4 flex-row items-center justify-between border-t border-white/15 pt-3">
              <Text className="text-xs text-white/60">This week</Text>
              <Text weight="semibold" className="text-sm text-white">
                {formatMoney(week.amountMinor)} · {week.count} sale{week.count === 1 ? "" : "s"}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {onboardingOpen && canTransact ? (
        <View className="mt-5">
          <OnboardingChecklist
            shopName={tenant?.name ?? "your shop"}
            steps={steps}
            onChoose={(step) => {
              if (step.key === "products") open("/inventory");
              else if (step.key === "sale") open("/sales");
              else open("/customers");
            }}
          />
        </View>
      ) : null}

      <View className="mt-5 flex-row gap-3">
        <View className="flex-1">
          <StatCard
            icon="wallet"
            label="Owed to you"
            tone={owed > 0 ? "accent" : "default"}
            value={<AmountText amount={owed} size="lg" />}
            caption={
              owedCount === 0 ? "Everyone is paid up" : `${owedCount} customer${owedCount === 1 ? "" : "s"} owe you`
            }
            onPress={() => router.navigate("/customers")}
          />
        </View>
        <View className="flex-1">
          <StatCard
            icon="cube-outline"
            label="Restock soon"
            tone={stock.low + stock.out > 0 ? "danger" : "default"}
            value={
              <Text weight="bold" className="text-[26px] tabular-nums tracking-tight text-ink">
                {stock.low + stock.out}
              </Text>
            }
            caption={
              stock.low + stock.out === 0
                ? "Every item is well stocked"
                : `${stock.low} low · ${stock.out} out of stock`
            }
            onPress={() => router.navigate("/inventory")}
          />
        </View>
      </View>

      {canTransact ? (
        <View className="mt-6">
          <SectionHeader title="Quick actions" className="mb-2.5" />
          <View className="flex-row gap-3">
            <ActionTile
              icon="person-add-outline"
              label="Add customer"
              onPress={() => open("/customers")}
            />
            <ActionTile icon="add-circle-outline" label="Stock in" onPress={() => open("/inventory")} />
          </View>
        </View>
      ) : (
        <View className="mt-6 rounded-2xl border border-line bg-paper-card px-4 py-4">
          <Text className="text-sm leading-5 text-ink-soft">
            You&apos;re watching this shop as a guest. Ask an owner if you need to record sales or
            move stock.
          </Text>
        </View>
      )}

      <View className="mt-6">
        <SectionHeader title="Reading your shop" className="mb-2.5" />
        <View className="gap-3">
          <InsightRow
            icon="trending-up"
            title="Top seller this week"
            body={
              top
                ? `${top.name} · ${top.quantity} unit${top.quantity === 1 ? "" : "s"}`
                : transactions.length === 0
                  ? "No sales yet - the first one starts the story."
                  : "No sale recorded in the last 7 days."
            }
          />
          <InsightRow
            icon="people-outline"
            title="Biggest balance"
            body={
              debtor
                ? `${debtor.name} · ${formatMoney(debtor.debtMinor)}`
                : "Nobody owes you money right now."
            }
          />
        </View>
      </View>

      <View className="mt-6 rounded-2xl border border-line bg-paper-card p-4">
        <Text className="text-xs leading-5 text-ink-faint">
          Every sale lands straight in your ledger. Balances are added to, never edited - so the
          numbers always tell the truth, even on the busiest market day.
        </Text>
      </View>
    </Screen>
  );
}

function ActionTile({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-paper-card px-3 py-4 active:opacity-80">
      <Ionicons name={icon} size={22} color="#1F5D3C" />
      <Text weight="medium" className="text-sm text-ink">
        {label}
      </Text>
    </Pressable>
  );
}

function InsightRow({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  return (
    <Card className="flex-row items-center gap-3 px-4 py-3.5">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent-tint">
        <Ionicons name={icon} size={18} color="#1F5D3C" />
      </View>
      <View className="flex-1">
        <Text className="text-xs text-ink-faint">{title}</Text>
        <Text weight="semibold" className="mt-0.5 text-sm leading-5 text-ink">
          {body}
        </Text>
      </View>
    </Card>
  );
}