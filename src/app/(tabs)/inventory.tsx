import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";

import { useFeedback } from "@/components/feedback";
import { ImportProductsCard } from "@/components/import-products";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text as T } from "@/components/ui/text";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/errors";
import { stockCounts } from "@/lib/insights";
import { formatMoney, toMinorUnits } from "@/lib/money";
import { ProductSummary } from "@/lib/types";

type StockType = "RESTOCK" | "ADJUST";

export default function InventoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ new?: string }>();
  const { tenant, canManageProducts, canTransact } = useAuth();
  const queryClient = useQueryClient();
  const feedback = useFeedback();

  const [manualAdd, setManualAdd] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [threshold, setThreshold] = useState("");
  const [qty, setQty] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);

  const [query, setQuery] = useState("");

  const [stockingId, setStockingId] = useState<string | null>(null);
  const [stockType, setStockType] = useState<StockType>("RESTOCK");
  const [stockQty, setStockQty] = useState("");
  const [stockCost, setStockCost] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [stockError, setStockError] = useState<string | null>(null);

  // "Add one"/new-product links land here with ?new=1 and open the form. The
  // param is consumed (cleared) here so a web refresh stays closed; opening is
  // derived from the param, no state to mirror back.
  useEffect(() => {
    if (params.new === "1") router.setParams({ new: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.new]);

  const addOpen = params.new === "1" || manualAdd;
  const closeAdd = () => {
    setManualAdd(false);
    if (params.new) router.setParams({ new: undefined });
  };

  const invalidateProducts = () => queryClient.invalidateQueries({ queryKey: ["products"] });

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<{ products: ProductSummary[] }>("/api/products"),
  });

  const products = useMemo(() => data?.products ?? [], [data]);
  const counts = stockCounts(products);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  const addMutation = useMutation({
    mutationFn: (input: {
      name: string;
      priceMinor: number;
      costMinor: number;
      lowStockThreshold: number;
      initialStockQty: number;
    }) => api<{ id: string }>("/api/products", { method: "POST", body: input }),
    onSuccess: () => {
      setName("");
      setPrice("");
      setCost("");
      setThreshold("");
      setQty("0");
      closeAdd();
      setFormError(null);
      feedback.show("Product added", "success");
      void invalidateProducts();
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : "Could not add product"),
  });

  const stockMutation = useMutation({
    mutationFn: (input: {
      productId: string;
      type: StockType;
      quantity: number;
      unitCostMinor?: number;
      note?: string;
    }) =>
      api(`/api/products/${input.productId}/stock`, {
        method: "POST",
        body: { type: input.type, quantity: input.quantity, unitCostMinor: input.unitCostMinor, note: input.note },
      }),
    onSuccess: (_data, input) => {
      const verb = input.type === "RESTOCK" ? "Restocked" : "Stock adjusted";
      setStockingId(null);
      setStockQty("");
      setStockCost("");
      setStockNote("");
      setStockError(null);
      feedback.show(`${verb} · ${input.quantity >= 0 ? "+" : ""}${input.quantity}`, "success");
      void invalidateProducts();
    },
    onError: (err) => setStockError(err instanceof ApiError ? err.message : "Could not update stock"),
  });

  const submitAdd = () => {
    const priceMinor = toMinorUnits(price);
    const costMinor = toMinorUnits(cost);
    if (!name.trim()) return setFormError("Give the product a name");
    if (priceMinor === null) return setFormError("Enter a valid selling price");
    if (costMinor === null) return setFormError("Enter a valid cost price");

    const initialStockQty = Math.floor(Number(qty.trim()));
    if (!Number.isInteger(initialStockQty) || initialStockQty < 0) {
      return setFormError("How many do you have now? A whole number, zero or more.");
    }

    const thresholdQty = Math.floor(Number(threshold.trim()));
    const lowStockThreshold =
      Number.isFinite(thresholdQty) && thresholdQty > 0 ? thresholdQty : 0;

    addMutation.mutate({
      name: name.trim(),
      priceMinor,
      costMinor,
      lowStockThreshold,
      initialStockQty,
    });
  };

  const submitStock = (productId: string) => {
    const quantity = Number(stockQty.trim());
    if (stockType === "RESTOCK") {
      if (!Number.isInteger(quantity) || quantity <= 0) return setStockError("How many units came in?");
      const unitCostMinor = toMinorUnits(stockCost);
      if (unitCostMinor === null) return setStockError("Enter a valid unit cost");
      stockMutation.mutate({ productId, type: stockType, quantity, unitCostMinor, note: stockNote.trim() || undefined });
    } else {
      if (!Number.isInteger(quantity) || quantity === 0) {
        return setStockError("Enter a change, e.g. -2 to remove");
      }
      stockMutation.mutate({ productId, type: stockType, quantity, note: stockNote.trim() || undefined });
    }
  };

  const busy = addMutation.isPending || stockMutation.isPending;

  const header = (
    <View>
      <ScreenHeader
        eyebrow={`Stock · ${tenant?.name ?? ""}`}
        title="Stock"
        subtitle="Know what's moving, what's low, and what to reorder before the customer asks."
      />

      <View className="mt-4 flex-row gap-3">
        <Metric
          icon={
            counts.out > 0 ? "remove-circle-outline" : "checkmark-circle-outline"
          }
          tone={counts.out > 0 ? "danger" : "accent"}
          label="Out of stock"
          value={counts.out}
          caption={counts.out > 0 ? `${counts.out} item${counts.out === 1 ? "" : "s"} empty` : "Nothing empty"}
        />
        <Metric
          icon="alert-circle-outline"
          tone={counts.low > 0 ? "gold" : "accent"}
          label="Running low"
          value={counts.low}
          caption={counts.low > 0 ? "below your alert level" : "all above alert level"}
        />
      </View>

      {addOpen ? (
        <View className="mt-4 rounded-2xl border border-line bg-paper-card p-4">
          <T display weight="semibold" className="text-lg text-ink">
            Add a product
          </T>
          <View className="mt-4 gap-3">
            <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Rose Gold 50ml" autoFocus />
            <Field
              label="Selling price (₦)"
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              placeholder="e.g. 12500"
              helper="What customers pay for it."
            />
            <Field
              label="Cost price (₦)"
              value={cost}
              onChangeText={setCost}
              keyboardType="numeric"
              placeholder="e.g. 8000"
              helper="What the supplier charges you - Oloja uses it to show your margin."
            />
            <Field
              label="How many do you have now?"
              value={qty}
              onChangeText={setQty}
              keyboardType="numeric"
              placeholder="e.g. 24"
              helper="Your opening stock. Leave 0 if it's arriving later."
            />
            <Field
              label="Low-stock alert at (units)"
              value={threshold}
              onChangeText={setThreshold}
              keyboardType="numeric"
              placeholder="e.g. 10 (optional)"
              helper="In units, not naira. We'll flag it when stock drops to this."
            />
          </View>
          {formError ? <T className="mt-3 text-sm text-danger">{formError}</T> : null}
          <View className="mt-4 flex-row gap-2">
            <Button title="Save product" onPress={submitAdd} disabled={busy} className="flex-1" />
            <Button title="Cancel" variant="secondary" onPress={closeAdd} />
          </View>
        </View>
      ) : canManageProducts ? (
        <>
          <Button
            title="Add product"
            icon="add"
            variant="secondary"
            onPress={() => setManualAdd(true)}
            className="mt-4"
          />
          <ImportProductsCard onImported={invalidateProducts} />
        </>
      ) : !canTransact ? (
        <View className="mt-4 rounded-2xl border border-line bg-paper-card px-4 py-3">
          <T className="text-sm text-ink-soft">
            You can watch stock, but only owners and staff can change it.
          </T>
        </View>
      ) : null}

      <View className="mt-4 gap-1.5">
        <View className="flex-row items-center gap-2 mb-4 rounded-xl border border-line bg-paper-card px-3">
          <Ionicons name="search" size={18} color="#B3A78D" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your stock…"
            placeholderTextColor="#B3A78D"
            className="h-[48px] flex-1 text-base text-ink"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} accessibilityRole="button" hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#B3A78D" />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <Screen>
      <FlatList
        className="flex-1"
        data={filtered}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          isError ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Could not load stock"
              body={error instanceof ApiError ? error.message : "Something went wrong."}>
              <Button title="Try again" onPress={() => void refetch()} />
            </EmptyState>
          ) : isLoading ? null : products.length === 0 ? (
            <EmptyState
              icon="cube-outline"
              title="The shelf is empty"
              body="Add the goods you sell, and Oloja tracks every unit so you always know when to restock."
              tip="You only need a name and a price to start.">
              {canManageProducts ? (
                <Button title="Add your first product" icon="add" onPress={() => setManualAdd(true)} />
              ) : null}
            </EmptyState>
          ) : (
            <EmptyState
              icon="search-outline"
              title="Nothing matches"
              body="Try a different name, or clear the search."
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor="#1F5D3C"
            colors={["#1F5D3C"]}
          />
        }
        contentContainerStyle={{ paddingBottom: 28 }}
        renderItem={({ item }) => {
          const low = item.stockQty > 0 && item.stockQty <= item.lowStockThreshold;
          const out = item.stockQty === 0;
          const stocking = stockingId === item.id;
          return (
            <Card className="mb-2.5 overflow-hidden">
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/product/${item.id}`)}
                className="px-4 py-3.5">
                <View className="flex-row items-center gap-3">
                  <View
                    className={cn(
                      "h-10 w-10 items-center justify-center rounded-xl",
                      out ? "bg-danger-tint" : low ? "bg-gold-tint" : "bg-accent-tint",
                    )}>
                    <Ionicons
                      name={out ? "close" : low ? "alert" : "cube-outline"}
                      size={17}
                      color={out ? "#AC4431" : low ? "#B98A2F" : "#1F5D3C"}
                    />
                  </View>
                  <View className="min-w-0 flex-1">
                    <T weight="semibold" className="text-[15px] text-ink" numberOfLines={1}>
                      {item.name}
                    </T>
                    <T className="mt-0.5 text-xs text-ink-soft">
                      {formatMoney(item.priceMinor)} · margin {formatMoney(item.priceMinor - item.costMinor)}
                    </T>
                  </View>
                  <View className="items-end shrink-0">
                    <Badge
                      tone={out ? "danger" : low ? "gold" : "accent"}
                      dot={!out}
                      label={out ? "Out of stock" : low ? `${item.stockQty} left` : `${item.stockQty} in stock`}
                    />
                  </View>
                </View>
              </Pressable>

              {stocking ? (
                <View className="border-t border-line px-4 py-4">
                  <View className="flex-row gap-2">
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
                  <T className="mt-2 text-xs text-ink-faint">
                    {stockType === "RESTOCK"
                      ? "Units came in? Record them here - it also refreshes the cost price."
                      : "Fix a wrong count: -2 removes two, +1 adds one."}
                  </T>
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
                  {stockError ? <T className="mt-3 text-sm text-danger">{stockError}</T> : null}
                  <View className="mt-3 flex-row gap-2">
                    <Button
                      title={stockType === "RESTOCK" ? "Save restock" : "Save adjustment"}
                      onPress={() => submitStock(item.id)}
                      disabled={busy}
                      className="flex-1"
                    />
                    <Button
                      title="Cancel"
                      variant="secondary"
                      onPress={() => {
                        setStockingId(null);
                        setStockQty("");
                        setStockCost("");
                        setStockNote("");
                        setStockError(null);
                      }}
                    />
                  </View>
                </View>
              ) : canTransact ? (
                <View className="border-t border-line px-4 py-3">
                  <View className="flex-row gap-2">
                    <Button
                      title="Restock"
                      icon="add"
                      variant="secondary"
                      size="sm"
                      onPress={() => {
                        setStockingId(item.id);
                        setStockType("RESTOCK");
                        setStockQty("");
                        setStockCost("");
                        setStockNote("");
                        setStockError(null);
                      }}
                      className="flex-1"
                    />
                    <Button
                      title="Adjust"
                      icon="swap-vertical-outline"
                      variant="secondary"
                      size="sm"
                      onPress={() => {
                        setStockingId(item.id);
                        setStockType("ADJUST");
                        setStockQty("");
                        setStockCost("");
                        setStockNote("");
                        setStockError(null);
                      }}
                      className="flex-1"
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          );
        }}
      />
    </Screen>
  );
}

function Metric({
  icon,
  label,
  value,
  caption,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  caption: string;
  tone: "accent" | "danger" | "gold";
}) {
  const tile = tone === "danger" ? "bg-danger-tint" : tone === "gold" ? "bg-gold-tint" : "bg-accent-tint";
  const color = tone === "danger" ? "#AC4431" : tone === "gold" ? "#B98A2F" : "#1F5D3C";
  return (
    <Card flat className="flex-1 px-4 py-3.5">
      <View className={cn("h-9 w-9 items-center justify-center rounded-xl", tile)}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <T weight="bold" className="mt-2 text-[26px] tabular-nums tracking-tight text-ink">
        {value}
      </T>
      <T className="text-[11px] uppercase tracking-[1.2px] text-ink-faint">{label}</T>
      <T className="mt-1 text-xs leading-4 text-ink-soft">{caption}</T>
    </Card>
  );
}