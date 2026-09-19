import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ReactNode } from "react";
import { Text, View } from "react-native";

import { AmountText } from "@/components/ui/amount-text";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { CustomerSummary, ProductSummary } from "@/lib/types";

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between border-t border-line px-4 py-4">
      <Text className="text-sm text-ink-soft">{label}</Text>
      {value}
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { tenant } = useAuth();
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: () => api<{ products: ProductSummary[] }>("/api/products"),
  });
  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => api<{ customers: CustomerSummary[] }>("/api/customers"),
  });

  const products = productsQuery.data?.products ?? [];
  const customers = customersQuery.data?.customers ?? [];

  const owedToYou = customers.reduce((sum, c) => sum + c.debtMinor, 0);
  const stockOnHand = products.reduce((sum, p) => sum + p.stockQty, 0);
  const lowStockCount = products.filter((p) => p.stockQty <= p.lowStockThreshold).length;

  return (
    <Screen>
      <View className="mt-2">
        <Text className="text-[11px] uppercase tracking-widest text-ink-faint">{tenant?.name}</Text>
        <Text className="mt-1 text-2xl font-semibold text-ink">Shop overview</Text>
        <Text className="mt-0.5 text-sm capitalize text-ink-soft">{today}</Text>
      </View>

      <View className="mt-6 rounded-lg border border-line bg-paper-card">
        <StatRow
          label="Owed to you"
          value={<AmountText amount={owedToYou} tone={owedToYou > 0 ? "owed" : "soft"} size="lg" />}
        />
        <StatRow
          label="Stock on hand"
          value={
            <Text className="text-2xl font-semibold tabular-nums tracking-tight text-ink">
              {stockOnHand}
            </Text>
          }
        />
        <StatRow
          label="Products tracked"
          value={
            <Text className="text-2xl font-semibold tabular-nums tracking-tight text-ink">
              {products.length}
            </Text>
          }
        />
      </View>

      {lowStockCount > 0 ? (
        <Text className="mt-3 text-xs font-medium text-danger">
          {lowStockCount} product{lowStockCount === 1 ? "" : "s"} running low on stock
        </Text>
      ) : null}

      <View className="mt-6">
        <Button title="Record a sale" onPress={() => router.navigate("/sales")} />
      </View>
      <Text className="mt-3 text-xs text-ink-faint">
        Every sale is written straight into your ledger. Balances are never edited, only added to.
      </Text>
    </Screen>
  );
}