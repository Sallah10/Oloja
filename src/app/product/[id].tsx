import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
import { useFeedback } from "@/components/feedback";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/errors";
import { formatMoney, toMinorUnits } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { ProductSummary, StockMovement } from "@/lib/types";

type StockType = "RESTOCK" | "ADJUST";

type Draft = { name: string; price: string; cost: string; threshold: string };

const toDraft = (p: ProductSummary): Draft => ({
  name: p.name,
  price: String(p.priceMinor / 100),
  cost: String(p.costMinor / 100),
  threshold: String(p.lowStockThreshold),
});

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isSignedIn, canManageProducts, canTransact } = useAuth();
  const queryClient = useQueryClient();
  const feedback = useFeedback();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [stockType, setStockType] = useState<StockType>("RESTOCK");
  const [stockQty, setStockQty] = useState("");
  const [stockCost, setStockCost] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [stockError, setStockError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["product", id] });
    queryClient.invalidateQueries({ queryKey: ["movements", id] });
  };

  const productQuery = useQuery({
    queryKey: ["product", id],
    queryFn: () => api<ProductSummary>(`/api/products/${id}`),
  });

  const product = productQuery.data;
  const fields = draft ?? (product ? toDraft(product) : null);

  const setField = (key: keyof Draft, value: string) =>
    setDraft((previous) => ({ ...(previous ?? toDraft(product!)), [key]: value }));

  const movementsQuery = useQuery({
    queryKey: ["movements", id],
    queryFn: () => api<{ movements: StockMovement[] }>(`/api/products/${id}/movements`),
  });

  const editMutation = useMutation({
    mutationFn: (input: {
      name: string;
      priceMinor: number;
      costMinor: number;
      lowStockThreshold: number;
    }) => api(`/api/products/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      setDraft(null);
      setEditError(null);
      feedback.show("Details saved", "success");
      void invalidate();
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : "Could not save changes"),
  });

  const stockMutation = useMutation({
    mutationFn: (input: {
      type: StockType;
      quantity: number;
      unitCostMinor?: number;
      note?: string;
    }) => api(`/api/products/${id}/stock`, { method: "POST", body: input }),
    onSuccess: (_data, input) => {
      const verb = input.type === "RESTOCK" ? "Restocked" : "Stock adjusted";
      setStockQty("");
      setStockCost("");
      setStockNote("");
      setStockError(null);
      feedback.show(`${verb} · ${input.quantity >= 0 ? "+" : ""}${input.quantity}`, "success");
      void invalidate();
    },
    onError: (err) => setStockError(err instanceof ApiError ? err.message : "Could not update stock"),
  });

  const submitEdit = () => {
    const current = draft ?? (product ? toDraft(product) : null);
    if (!current) return;
    const priceMinor = toMinorUnits(current.price);
    const costMinor = toMinorUnits(current.cost);
    if (!current.name.trim()) return setEditError("Give the product a name");
    if (priceMinor === null) return setEditError("Enter a valid selling price");
    if (costMinor === null) return setEditError("Enter a valid cost price");
    const thresholdQty = Math.floor(Number(current.threshold.trim()));
    editMutation.mutate({
      name: current.name.trim(),
      priceMinor,
      costMinor,
      lowStockThreshold:
        Number.isFinite(thresholdQty) && thresholdQty > 0 ? thresholdQty : 0,
    });
  };

  const submitStock = () => {
    const quantity = Number(stockQty.trim());
    if (stockType === "RESTOCK") {
      if (!Number.isInteger(quantity) || quantity <= 0) return setStockError("How many units came in?");
      const unitCostMinor = toMinorUnits(stockCost);
      if (unitCostMinor === null) return setStockError("Enter a valid unit cost");
      stockMutation.mutate({ type: stockType, quantity, unitCostMinor, note: stockNote.trim() || undefined });
    } else {
      if (!Number.isInteger(quantity) || quantity === 0) {
        return setStockError("Enter a change, e.g. -2 to remove");
      }
      stockMutation.mutate({ type: stockType, quantity, note: stockNote.trim() || undefined });
    }
  };

  if (!isSignedIn) return <Redirect href="/login" />;

  const movements = movementsQuery.data?.movements ?? [];
  const low = (product?.stockQty ?? 0) > 0 && (product?.stockQty ?? 0) <= (product?.lowStockThreshold ?? 0);
  const out = (product?.stockQty ?? 0) === 0;

  return (
    <Screen scroll>
      <View className="flex-row items-center gap-3">
        <BackLink fallback="/inventory" />
        <Text display weight="semibold" className="min-w-0 flex-1 text-2xl leading-7 text-ink" numberOfLines={3}>
          {product?.name ?? "Product"}
        </Text>
      </View>

      {product ? (
        <View className="mt-5 gap-4">
          <View className="rounded-3xl border border-accent-deep bg-accent-deep px-5 py-5">
            <View className="flex-row items-center justify-between">
              <Text weight="semibold" className="text-[11px] uppercase tracking-[1.6px] text-white/60">
                Stock on hand
              </Text>
              <Badge
                tone={out ? "danger" : low ? "gold" : "ink"}
                label={out ? "Out of stock" : low ? "Running low" : "In stock"}
              />
            </View>
            <Text
              weight="bold"
              className="mt-2 text-5xl tabular-nums tracking-tight text-white"
              style={{ fontVariant: ["tabular-nums"] }}>
              {product.stockQty}
            </Text>
            <Text className="mt-1 text-sm text-white/70">
              Sells for {formatMoney(product.priceMinor)} ·{" "}
              {product.costMinor > 0 ? (
                <Text weight="semibold" style={{ color: "#FFF" }}>
                  margin {formatMoney(product.priceMinor - product.costMinor)}
                </Text>
              ) : (
                <Text style={{ color: "#FFF" }}>no cost yet - add it on a restock</Text>
              )}
            </Text>
            {product.lowStockThreshold > 0 ? (
              <Text className="mt-0.5 text-xs text-white/45">
                Low-stock alert at {product.lowStockThreshold} units
              </Text>
            ) : null}
          </View>

          {canTransact ? (
            <Card className="p-4">
              <Text weight="medium" className="text-base text-ink">
                Update stock
              </Text>
              <View className="mt-3 flex-row gap-2">
                <Button
                  title="Restock"
                  variant={stockType === "RESTOCK" ? "primary" : "secondary"}
                  onPress={() => {
                    setStockType("RESTOCK");
                    setStockError(null);
                  }}
                  className="flex-1"
                />
                <Button
                  title="Adjust"
                  variant={stockType === "ADJUST" ? "primary" : "secondary"}
                  onPress={() => {
                    setStockType("ADJUST");
                    setStockError(null);
                  }}
                  className="flex-1"
                />
              </View>
              <Text className="mt-2 text-xs text-ink-faint">
                {stockType === "RESTOCK"
                  ? "Goods came in? Record them here - it also refreshes the cost price."
                  : "Fix a wrong count: a minus removes stock, a plus adds it."}
              </Text>
              <View className={cn("mt-3 gap-3", stockType === "ADJUST" && "flex-row")}>
                <Field
                  label={stockType === "ADJUST" ? "Change (can be −)" : "Units received"}
                  value={stockQty}
                  onChangeText={setStockQty}
                  keyboardType="numbers-and-punctuation"
                  placeholder={stockType === "ADJUST" ? "e.g. -2" : "e.g. 12"}
                  className={stockType === "ADJUST" ? "flex-1" : undefined}
                />
                {stockType === "RESTOCK" ? (
                  <Field
                    label="Unit cost (₦)"
                    value={stockCost}
                    onChangeText={setStockCost}
                    keyboardType="numeric"
                    placeholder="e.g. 8000"
                  />
                ) : null}
              </View>
              <View className="mt-3">
                <Field
                  label="Note (optional)"
                  value={stockNote}
                  onChangeText={setStockNote}
                  placeholder="e.g. supplier damaged 2 units"
                />
              </View>
              {stockError ? <Text className="mt-3 text-sm text-danger">{stockError}</Text> : null}
              <Button
                title={stockMutation.isPending ? "Saving…" : "Save stock change"}
                onPress={submitStock}
                disabled={stockMutation.isPending}
                className="mt-4"
              />
            </Card>
          ) : null}

          {canManageProducts ? (
            <Card className="p-4">
              <Text weight="medium" className="text-base text-ink">
                Details
              </Text>
              <View className="mt-3 gap-3">
                <Field label="Name" value={fields?.name ?? ""} onChangeText={(v) => setField("name", v)} />
                <Field
                  label="Selling price (₦)"
                  value={fields?.price ?? ""}
                  onChangeText={(v) => setField("price", v)}
                  keyboardType="numeric"
                />
                <Field
                  label="Cost price (₦)"
                  value={fields?.cost ?? ""}
                  onChangeText={(v) => setField("cost", v)}
                  keyboardType="numeric"
                />
                <Field
                  label="Low-stock alert at"
                  value={fields?.threshold ?? ""}
                  onChangeText={(v) => setField("threshold", v)}
                  keyboardType="numeric"
                  helper="In units, not naira - flag when this many are left."
                />
              </View>
              {editError ? <Text className="mt-3 text-sm text-danger">{editError}</Text> : null}
              <Button
                title={editMutation.isPending ? "Saving…" : "Save details"}
                onPress={submitEdit}
                disabled={editMutation.isPending}
                className="mt-4"
              />
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <View className="px-4 pt-4">
              <Text weight="semibold" className="text-[11px] uppercase tracking-[1.4px] text-ink-faint">
                Stock movements
              </Text>
            </View>
            {movementsQuery.isLoading ? (
              <Text className="px-4 py-4 text-sm text-ink-soft">Loading…</Text>
            ) : movements.length === 0 ? (
              <Text className="px-4 py-4 text-sm text-ink-soft">
                No movements yet. Restock or adjust to start the ledger.
              </Text>
            ) : (
              movements.map((movement) => (
                <View key={movement.id} className="border-t border-line px-4 py-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-medium text-ink">
                      {movement.type === "RESTOCK"
                        ? "Restock"
                        : movement.type === "ADJUST"
                          ? "Adjustment"
                          : "Sale"}
                    </Text>
                    <Text
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        movement.quantity >= 0 ? "text-accent-deep" : "text-danger-deep",
                      )}>
                      {movement.quantity >= 0 ? "+" : ""}
                      {movement.quantity}
                    </Text>
                  </View>
                  {movement.note ? (
                    <Text className="mt-0.5 text-xs text-ink-soft">{movement.note}</Text>
                  ) : null}
                  <Text className="mt-0.5 text-xs text-ink-faint">
                    {formatMoney(movement.unitCostMinor)} · {formatDateTime(movement.createdAt)}
                  </Text>
                </View>
              ))
            )}
          </Card>
        </View>
      ) : productQuery.isError ? (
        <View className="mt-4 gap-2">
          <Text className="text-sm text-danger">
            {productQuery.error instanceof ApiError
              ? productQuery.error.message
              : "Could not load this product."}
          </Text>
          {canTransact ? (
            <Text className="text-sm text-ink-soft">You can still record stock changes below.</Text>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}