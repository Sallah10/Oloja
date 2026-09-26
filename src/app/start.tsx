import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { useFeedback } from "@/components/feedback";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/ui/screen";
import { Text as T } from "@/components/ui/text";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/errors";
import { toMinorUnits } from "@/lib/money";
import { TradeTemplate, TRADE_TEMPLATES } from "@/lib/templates";

/**
 * The first-shelf wizard. A brand-new shop picks the trade closest to theirs
 * and Oloja pre-fills the everyday items, each with a price they can edit in
 * place. One tap adds them all - the owner can change anything later, and the
 * ledger starts honest (no guessed costs).
 */
export default function StartScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const { isSignedIn, canManageProducts } = useAuth();

  const [tradeId, setTradeId] = useState<string | null>(null);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const trade = TRADE_TEMPLATES.find((t) => t.id === tradeId) ?? null;
  const count = trade ? trade.products.filter((p) => included[p.name]).length : 0;

  if (!isSignedIn) return <Redirect href="/login" />;
  if (!canManageProducts) return <Redirect href="/" />;

  const selectTrade = (t: TradeTemplate) => {
    const inc: Record<string, boolean> = {};
    const pr: Record<string, string> = {};
    for (const p of t.products) {
      inc[p.name] = true;
      pr[p.name] = String(p.priceMinor / 100);
    }
    setIncluded(inc);
    setPrices(pr);
    setTradeId(t.id);
  };

  const changeTrade = () => {
    setTradeId(null);
    setIncluded({});
    setPrices({});
  };

  const toggle = (name: string) =>
    setIncluded((prev) => ({ ...prev, [name]: !prev[name] }));

  // Each product is one POST with the suggested price the owner left on it.
  // Products need a connection (the server issues the id), so the batch stops
  // if the network drops and reports what made it through.
  const seed = async () => {
    if (!trade) return;
    setBusy(true);
    const names = trade.products.filter((p) => included[p.name]).map((p) => p.name);
    let added = 0;
    let skipped = 0;
    let aborted = false;
    for (const name of names) {
      const priceMinor = toMinorUnits(prices[name] ?? "");
      if (priceMinor === null || priceMinor <= 0) {
        skipped++;
        continue;
      }
      try {
        await api("/api/products", {
          method: "POST",
          body: { name, priceMinor, costMinor: 0, lowStockThreshold: 0, initialStockQty: 0 },
        });
        added++;
      } catch (err) {
        skipped++;
        if (!(err instanceof ApiError)) {
          aborted = true;
          break;
        }
      }
    }
    setBusy(false);

    if (added === 0) {
      feedback.show("Nothing was added - check the prices and try again", "error");
      return;
    }
    feedback.show(
      added === names.length
        ? `Shelf set · ${added} product${added === 1 ? "" : "s"}`
        : `Added ${added} · skipped ${skipped}${aborted ? " (you lost connection)" : ""}`,
      aborted ? "error" : "success",
    );
    await queryClient.invalidateQueries({ queryKey: ["products"] });
    router.replace("/inventory");
  };

  return (
    <Screen scroll>
      <BackLink fallback="/" />

      <View className="mt-3">
        <T display weight="semibold" className="text-[26px] leading-8 text-ink">
          {trade ? "Your first shelf" : "What kind of shop is yours?"}
        </T>
        <T className="mt-1 text-sm leading-5 text-ink-soft">
          {trade
            ? "Everyday things shops like yours carry. Tap to drop one, or edit any price - you keep everything."
            : "Pick the closest match and we'll pre-fill the everyday things you sell. Prices are yours to change."}
        </T>
      </View>

      {trade ? (
        <>
          <View className="mt-4 gap-2">
            {trade.products.map((p) => {
              const on = Boolean(included[p.name]);
              return (
                <View
                  key={p.name}
                  className={cn(
                    "rounded-xl border px-3 py-2.5",
                    on ? "border-accent bg-accent-tint" : "border-line bg-paper-card",
                  )}>
                  <View className="flex-row items-center justify-between gap-3">
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() => toggle(p.name)}
                      className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-75">
                      <View
                        className={cn(
                          "h-6 w-6 items-center justify-center rounded-full border",
                          on ? "border-accent bg-accent" : "border-line bg-paper-card",
                        )}>
                        {on ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                      </View>
                      <T
                        weight={on ? "semibold" : "normal"}
                        numberOfLines={2}
                        className={cn("flex-1 text-sm leading-5", on ? "text-ink" : "text-ink-soft")}>
                        {p.name}
                      </T>
                    </Pressable>
                    <View className="flex-row items-center gap-1.5">
                      <T className="text-sm text-ink-soft">₦</T>
                      <TextInput
                        value={prices[p.name]}
                        onChangeText={(v) => setPrices((prev) => ({ ...prev, [p.name]: v }))}
                        editable={on}
                        keyboardType="numeric"
                        placeholder="Price"
                        placeholderTextColor="#B3A78D"
                        className={cn(
                          "h-10 min-w-[96px] rounded-lg border border-line bg-paper px-2.5 text-right text-sm tabular-nums",
                          on ? "text-ink" : "opacity-40",
                        )}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          <View className="mt-5 gap-2">
            <Button
              title={count > 0 ? `Add ${count} to my shelf` : "Add to my shelf"}
              disabled={count === 0 || busy}
              onPress={() => void seed()}
            />
            <Button title="Pick a different trade" variant="ghost" onPress={changeTrade} />
            <Button title="Skip for now - I'll add my own" variant="ghost" onPress={() => router.replace("/")} />
          </View>
        </>
      ) : (
        <>
          <View className="mt-4 flex-row flex-wrap gap-3">
            {TRADE_TEMPLATES.map((t) => (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                onPress={() => selectTrade(t)}
                className="min-w-0 flex-1 basis-[46%] flex-grow rounded-2xl border border-line bg-paper-card px-4 py-4 active:opacity-80">
                <View className="h-11 w-11 items-center justify-center rounded-xl bg-accent-tint">
                  <Ionicons name={t.icon} size={20} color="#1F5D3C" />
                </View>
                <T weight="semibold" className="mt-3 text-[15px] leading-5 text-ink">
                  {t.name}
                </T>
                <T className="mt-1 text-xs leading-4 text-ink-soft">{t.blurb}</T>
              </Pressable>
            ))}
          </View>

          <Button title="Skip for now - I'll add my own" variant="ghost" onPress={() => router.replace("/")} className="mt-5" />
        </>
      )}
    </Screen>
  );
}