import { useRouter } from "expo-router";
import { ReactNode } from "react";
import { Text, View } from "react-native";

import { AmountText } from "@/components/ui/amount-text";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";

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
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <Screen>
      <View className="mt-2">
        <Text className="text-[11px] uppercase tracking-widest text-ink-faint">Oloja · ledger</Text>
        <Text className="mt-1 text-2xl font-semibold text-ink">Shop overview</Text>
        <Text className="mt-0.5 text-sm capitalize text-ink-soft">{today}</Text>
      </View>

      <View className="mt-6 rounded-lg border border-line bg-paper-card">
        <StatRow label="Owed to you" value={<AmountText amount={0} tone="owed" size="lg" />} />
        <StatRow label="Stock on hand" value={<AmountText amount={0} size="lg" />} />
        <StatRow
          label="Products tracked"
          value={<Text className="text-2xl font-semibold tabular-nums tracking-tight text-ink">0</Text>}
        />
      </View>

      <View className="mt-6">
        <Button title="Record a sale" onPress={() => router.navigate("/sales")} />
      </View>
      <Text className="mt-3 text-xs text-ink-faint">
        Every sale is written straight into your ledger. Balances are never edited, only added to.
      </Text>
    </Screen>
  );
}