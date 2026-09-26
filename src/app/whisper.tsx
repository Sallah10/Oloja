import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";

import { BackLink } from "@/components/ui/back-link";
import { Screen } from "@/components/ui/screen";
import { ScreenHeader } from "@/components/ui/screen-header";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Text } from "@/components/ui/text";
import { WhisperRow } from "@/components/whisper";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { advice, businessHealth, whisper } from "@/lib/whisper";
import { formatMoney } from "@/lib/money";
import { CustomerSummary, ProductSummary, TransactionSummary } from "@/lib/types";

/**
 * The full whisper read. Where the Home teaser pulls only the top two or three
 * alerts, this screen opens the whole advisor: the money-shape of the shop
 * (capital in goods, money parked, what's owed) and the quieter business
 * advice that follows from it.
 */
export default function WhisperScreen() {
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

  const products = productsQuery.data?.products ?? [];
  const customers = customersQuery.data?.customers ?? [];
  const transactions = transactionsQuery.data?.transactions ?? [];

  const thread = whisper(products, customers, transactions);
  const health = businessHealth(products, customers, transactions);
  const advices = advice(products, customers, transactions);

  const dateLabel = new Date().toLocaleDateString("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const noCostPrices = health.unknownCostGoodsCount > 0 && health.capitalInGoodsMinor === 0;

  return (
    <Screen scroll>
      <View className="flex-row items-center gap-3">
        <BackLink fallback="/" />
      </View>

      <ScreenHeader
        eyebrow="THE WHISPER"
        title="Your quiet advisor"
        subtitle={`${dateLabel} · reading the ledger of ${tenant?.name ?? "your shop"}`}
        className="mt-4"
      />

      <View className="mt-4 rounded-2xl border border-line bg-paper-card p-4 shadow-soft">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="ear-outline" size={14} color="#B3A78D" />
          <Text className="text-[11px] uppercase tracking-[1.4px] text-ink-faint">Weekly word</Text>
        </View>
        <Text weight="semibold" className="mt-2 text-base leading-6 text-ink">
          {thread.headline}
        </Text>
        <Text className="mt-1 text-sm leading-5 text-ink-soft">
          Every line below is a real number from your ledger - the whisper never invents.
        </Text>
      </View>

      <View className="mt-6">
        <SectionHeader title="The shape of your money" className="mb-2.5" />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <StatCard
              icon="cash-outline"
              label="Money in goods"
              tone={health.capitalInGoodsMinor > 0 ? "accent" : "default"}
              value={
                <Text weight="bold" className="text-lg tabular-nums tracking-tight text-ink">
                  {noCostPrices ? "—" : formatMoney(health.capitalInGoodsMinor)}
                </Text>
              }
              caption={noCostPrices ? "Cost prices will unlock this" : "Capital sitting as stock"}
              onPress={() => router.navigate("/inventory")}
            />
          </View>
          <View className="flex-1">
            <StatCard
              icon="push-outline"
              label="Parked on the shelf"
              tone={health.parkedMinor > 0 ? "gold" : "default"}
              value={
                <Text weight="bold" className="text-lg tabular-nums tracking-tight text-ink">
                  {formatMoney(health.parkedMinor)}
                </Text>
              }
              caption="Unsold for two weeks"
              onPress={() => router.navigate("/inventory")}
            />
          </View>
        </View>
        <View className="mt-3 flex-row gap-3">
          <View className="flex-1">
            <StatCard
              icon="wallet-outline"
              label="Owed to you"
              tone={health.owedMinor > 0 ? "accent" : "default"}
              value={
                <Text weight="bold" className="text-lg tabular-nums tracking-tight text-ink">
                  {formatMoney(health.owedMinor)}
                </Text>
              }
              caption={
                health.avgDailyTakeMinor > 0
                  ? `≈ ${Math.max(1, Math.round(health.owedMinor / health.avgDailyTakeMinor))} days of take`
                  : "On credit ledgers"
              }
              onPress={() => router.navigate("/customers")}
            />
          </View>
          <View className="flex-1">
            <StatCard
              icon="calendar-outline"
              label="This month's take"
              tone="accent"
              value={
                <Text weight="bold" className="text-lg tabular-nums tracking-tight text-ink">
                  {formatMoney(health.monthTakeMinor)}
                </Text>
              }
              caption="Recorded sales, cash + credit"
              onPress={() => router.navigate("/report")}
            />
          </View>
        </View>
      </View>

      <View className="mt-6">
        <SectionHeader title="Watch these" className="mb-2.5" />
        <View className="gap-3">
          {thread.cards.map((card) => (
            <WhisperRow key={card.id} card={card} />
          ))}
        </View>
      </View>

      {advices.length > 0 ? (
        <View className="mt-6">
          <SectionHeader title="Keeps you wise" className="mb-2.5" />
          <View className="gap-3">
            {advices.map((card) => (
              <WhisperRow key={card.id} card={card} />
            ))}
          </View>
        </View>
      ) : null}

      <View className="mt-6 rounded-2xl border border-line bg-paper-card p-4">
        <Text className="text-xs leading-5 text-ink-faint">
          The whisper reads what you record. The more cost prices, restocks and payments you keep,
          the sharper the next day becomes.
        </Text>
      </View>
    </Screen>
  );
}