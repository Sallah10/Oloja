import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
import { useAuth } from "@/context/auth-context";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatMoney, toMinorUnits } from "@/lib/money";

type ProductSummary = {
  id: string;
  name: string;
  note: string | null;
  priceMinor: number;
  costMinor: number;
  lowStockThreshold: number;
  archived: boolean;
  createdAt: string;
  stockQty: number;
};

export default function InventoryScreen() {
  const { tenant, signOut } = useAuth();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [threshold, setThreshold] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [stockingId, setStockingId] = useState<string | null>(null);
  const [stockQty, setStockQty] = useState("");
  const [stockError, setStockError] = useState<string | null>(null);

  const invalidateProducts = () =>
    queryClient.invalidateQueries({ queryKey: ["products"] });

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<{ products: ProductSummary[] }>("/api/products"),
  });

  const addMutation = useMutation({
    mutationFn: (input: {
      name: string;
      priceMinor: number;
      costMinor: number;
      lowStockThreshold: number;
    }) => api<{ id: string }>("/api/products", { method: "POST", body: input }),
    onSuccess: () => {
      setName("");
      setPrice("");
      setCost("");
      setThreshold("");
      setAddOpen(false);
      setFormError(null);
      void invalidateProducts();
    },
    onError: (err) =>
      setFormError(err instanceof ApiError ? err.message : "Could not add product"),
  });

  const stockMutation = useMutation({
    mutationFn: (input: { productId: string; quantity: number; unitCostMinor: number }) =>
      api(`/api/products/${input.productId}/stock`, {
        method: "POST",
        body: { type: "RESTOCK", quantity: input.quantity, unitCostMinor: input.unitCostMinor },
      }),
    onSuccess: () => {
      setStockingId(null);
      setStockQty("");
      setStockError(null);
      void invalidateProducts();
    },
    onError: (err) =>
      setStockError(err instanceof ApiError ? err.message : "Could not restock"),
  });

  const products = data?.products ?? [];

  const submitAdd = () => {
    const priceMinor = toMinorUnits(price);
    const costMinor = toMinorUnits(cost);
    if (!name.trim()) return setFormError("Give the product a name");
    if (priceMinor === null) return setFormError("Enter a valid selling price");
    if (costMinor === null) return setFormError("Enter a valid cost price");
    const thresholdMinor = toMinorUnits(threshold) ?? 0;
    addMutation.mutate({
      name: name.trim(),
      priceMinor,
      costMinor,
      lowStockThreshold: thresholdMinor,
    });
  };

  const submitStock = (productId: string, unitCostMinor: number) => {
    const quantity = Number(stockQty.trim());
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return setStockError("Enter how many units came in");
    }
    stockMutation.mutate({ productId, quantity, unitCostMinor });
  };

  return (
    <Screen>
      <View className="mt-2 flex-row items-center justify-between">
        <View>
          <Text className="text-[11px] uppercase tracking-widest text-ink-faint">
            Stock · {tenant?.name}
          </Text>
          <Text className="mt-1 text-2xl font-semibold text-ink">Inventory</Text>
        </View>
        <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
      </View>

      {addOpen ? (
        <View className="mt-4 gap-4 rounded-lg border border-line bg-paper-card p-4">
          <Text className="text-sm font-medium text-ink">Add a product</Text>
          <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Rose Gold 50ml" />
          <Field
            label="Selling price (naira)"
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
            placeholder="e.g. 12500"
          />
          <Field
            label="Cost price (naira)"
            value={cost}
            onChangeText={setCost}
            keyboardType="numeric"
            placeholder="e.g. 8000"
          />
          <Field
            label="Low-stock alert at"
            value={threshold}
            onChangeText={setThreshold}
            keyboardType="numeric"
            placeholder="e.g. 10 (optional)"
          />
          {formError ? <Text className="text-sm text-danger">{formError}</Text> : null}
          <View className="flex-row gap-3">
            <Button
              title="Save product"
              onPress={submitAdd}
              disabled={addMutation.isPending}
              className="flex-1"
            />
            <Button title="Cancel" variant="secondary" onPress={() => setAddOpen(false)} />
          </View>
        </View>
      ) : (
        <Button
          title="＋ Add product"
          variant="secondary"
          onPress={() => setAddOpen(true)}
          className="mt-4 self-start"
        />
      )}

      {isError ? (
        <EmptyState
          title="Could not load stock"
          body={error instanceof ApiError ? error.message : "Something went wrong."}
        >
          <Button title="Try again" onPress={() => void refetch()} />
        </EmptyState>
      ) : (
        <FlatList
          className="mt-4"
          data={products}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor="#1E5A3B"
            />
          }
          ListEmptyComponent={
            isLoading ? null : (
              <EmptyState
                title="No products yet"
                body="Add the goods you sell, and this tracks your stock levels so you know when to restock."
              />
            )
          }
          renderItem={({ item }) => {
            const low = item.stockQty <= item.lowStockThreshold;
            const stocking = stockingId === item.id;
            return (
              <View className="mb-3 rounded-lg border border-line bg-paper-card p-4">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-medium text-ink">{item.name}</Text>
                    <Text className="mt-0.5 text-sm text-ink-soft">
                      {formatMoney(item.priceMinor)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text
                      className={cn(
                        "text-lg font-semibold tabular-nums tracking-tight",
                        low ? "text-danger" : "text-ink",
                      )}>
                      {item.stockQty}
                    </Text>
                    <Text className="text-[11px] uppercase tracking-wide text-ink-faint">left</Text>
                  </View>
                </View>

                {low ? (
                  <Text className="mt-2 text-xs font-medium text-danger">Running low on stock</Text>
                ) : null}

                {stocking ? (
                  <View className="mt-3 gap-3">
                    <Field
                      label="Units received"
                      value={stockQty}
                      onChangeText={setStockQty}
                      keyboardType="number-pad"
                      placeholder="e.g. 12"
                    />
                    {stockError ? <Text className="text-sm text-danger">{stockError}</Text> : null}
                    <View className="flex-row gap-3">
                      <Button
                        title="Save restock"
                        onPress={() => submitStock(item.id, item.costMinor)}
                        disabled={stockMutation.isPending}
                        className="flex-1"
                      />
                      <Button
                        title="Cancel"
                        variant="secondary"
                        onPress={() => {
                          setStockingId(null);
                          setStockQty("");
                          setStockError(null);
                        }}
                      />
                    </View>
                  </View>
                ) : (
                  <Button
                    title="Restock"
                    variant="secondary"
                    onPress={() => {
                      setStockingId(item.id);
                      setStockError(null);
                    }}
                    className="mt-3 self-start"
                  />
                )}
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}