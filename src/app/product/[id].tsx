import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
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
  threshold: String(p.lowStockThreshold / 100),
});

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isSignedIn, canManageProducts, canTransact } = useAuth();
  const queryClient = useQueryClient();

  // A draft holds the user's in-progress edits. Until the first keystroke it
  // stays null and the form renders the server values straight from the query.
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
      void invalidate();
    },
    onError: (err) =>
      setEditError(err instanceof ApiError ? err.message : "Could not save changes"),
  });

  const stockMutation = useMutation({
    mutationFn: (input: {
      type: StockType;
      quantity: number;
      unitCostMinor?: number;
      note?: string;
    }) => api(`/api/products/${id}/stock`, { method: "POST", body: input }),
    onSuccess: () => {
      setStockQty("");
      setStockCost("");
      setStockNote("");
      setStockError(null);
      void invalidate();
    },
    onError: (err) =>
      setStockError(err instanceof ApiError ? err.message : "Could not update stock"),
  });

  const submitEdit = () => {
    const current = draft ?? (product ? toDraft(product) : null);
    if (!current) return;
    const priceMinor = toMinorUnits(current.price);
    const costMinor = toMinorUnits(current.cost);
    if (!current.name.trim()) return setEditError("Give the product a name");
    if (priceMinor === null) return setEditError("Enter a valid selling price");
    if (costMinor === null) return setEditError("Enter a valid cost price");
    editMutation.mutate({
      name: current.name.trim(),
      priceMinor,
      costMinor,
      lowStockThreshold: toMinorUnits(current.threshold) ?? 0,
    });
  };

  const submitStock = () => {
    const quantity = Number(stockQty.trim());
    if (stockType === "RESTOCK") {
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return setStockError("Enter how many units came in");
      }
      const unitCostMinor = toMinorUnits(stockCost);
      if (unitCostMinor === null) return setStockError("Enter a valid unit cost");
      stockMutation.mutate({
        type: stockType,
        quantity,
        unitCostMinor,
        note: stockNote.trim() || undefined,
      });
    } else {
      if (!Number.isInteger(quantity) || quantity === 0) {
        return setStockError("Enter a non-zero amount to add or remove (e.g. -2 to remove)");
      }
      stockMutation.mutate({
        type: stockType,
        quantity,
        note: stockNote.trim() || undefined,
      });
    }
  };

  if (!isSignedIn) return <Redirect href="/login" />;

  return (
    <Screen scroll>
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-3 text-2xl font-semibold text-ink">
          {product?.name ?? "Product"}
        </Text>
        <BackLink />
      </View>

      {productQuery.isError ? (
        <Text className="mt-4 text-sm text-danger">
          {productQuery.error instanceof ApiError
            ? productQuery.error.message
            : "Could not load this product."}
          {canTransact ? (
            <Text className="text-ink-soft"> You can still record stock changes below.</Text>
          ) : null}
        </Text>
      ) : null}

      {product ? (
        <View className="mt-5 gap-4">
          <View className="flex-row items-center justify-between rounded-lg border border-line bg-paper-card px-4 py-3">
            <View>
              <Text className="text-[11px] uppercase tracking-widest text-ink-faint">Stock on hand</Text>
              <Text className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-ink">
                {product.stockQty}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-[11px] uppercase tracking-widest text-ink-faint">Low-stock alert</Text>
              <Text className="mt-1 text-base font-medium tabular-nums text-ink-soft">
                {product.lowStockThreshold}
              </Text>
            </View>
          </View>

          {canTransact ? (
            <View className="rounded-lg border border-line bg-paper-card p-4">
              <Text className="text-sm font-medium text-ink">Update stock</Text>
              <View className="mt-3 flex-row gap-3">
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
              <Text className="mt-3 text-xs text-ink-faint">
                {stockType === "RESTOCK"
                  ? "Record goods that came in. This also refreshes the cost price."
                  : "Fix a wrong count: a negative number removes stock, a positive one adds it."}
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
                    label="Unit cost (naira)"
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
            </View>
          ) : null}

          {canManageProducts ? (
            <View className="rounded-lg border border-line bg-paper-card p-4">
              <Text className="text-sm font-medium text-ink">Details</Text>
              <View className="mt-3 gap-3">
                <Field
                  label="Name"
                  value={fields?.name ?? ""}
                  onChangeText={(value) => setField("name", value)}
                />
                <Field
                  label="Selling price (naira)"
                  value={fields?.price ?? ""}
                  onChangeText={(value) => setField("price", value)}
                  keyboardType="numeric"
                />
                <Field
                  label="Cost price (naira)"
                  value={fields?.cost ?? ""}
                  onChangeText={(value) => setField("cost", value)}
                  keyboardType="numeric"
                />
                <Field
                  label="Low-stock alert at (naira)"
                  value={fields?.threshold ?? ""}
                  onChangeText={(value) => setField("threshold", value)}
                  keyboardType="numeric"
                />
              </View>
              {editError ? <Text className="mt-3 text-sm text-danger">{editError}</Text> : null}
              <Button
                title={editMutation.isPending ? "Saving…" : "Save details"}
                onPress={submitEdit}
                disabled={editMutation.isPending}
                className="mt-4"
              />
            </View>
          ) : null}

          <View className="rounded-lg border border-line bg-paper-card overflow-hidden">
            <Text className="px-4 pt-4 text-[11px] uppercase tracking-widest text-ink-faint">
              Stock movements
            </Text>
            {movementsQuery.isLoading ? null : movementsQuery.data?.movements.length === 0 ? (
              <Text className="px-4 py-4 text-sm text-ink-soft">
                No movements yet. Restock or adjust to start the ledger.
              </Text>
            ) : (
              (movementsQuery.data?.movements ?? []).map((movement) => (
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
                        movement.quantity >= 0 ? "text-accent" : "text-danger",
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
          </View>
        </View>
      ) : null}
    </Screen>
  );
}