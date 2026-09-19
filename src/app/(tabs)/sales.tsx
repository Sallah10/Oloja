import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";

import { AmountText } from "@/components/ui/amount-text";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { cn } from "@/lib/cn";
import { formatMoney, toMinorUnits } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { CustomerSummary, ProductSummary, TransactionSummary } from "@/lib/types";

type PayMode = "cash" | "credit";

export default function SalesScreen() {
  const { tenant, canTransact } = useAuth();
  const queryClient = useQueryClient();

  const [recording, setRecording] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [mode, setMode] = useState<PayMode>("cash");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: productsData } = useQuery({
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

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["customers"] });
  };

  const saleMutation = useMutation({
    mutationFn: (input: {
      productId: string;
      quantity: number;
      unitPriceMinor: number;
      onCredit: boolean;
      customerId?: string;
    }) => api("/api/sales", { method: "POST", body: input }),
    onSuccess: () => {
      setRecording(false);
      setProductId(null);
      setQuantity("");
      setPrice("");
      setCustomerId(null);
      setError(null);
      invalidateAll();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Could not record this sale"),
  });

  const products = productsData?.products ?? [];
  const customers = customersQuery.data?.customers ?? [];
  const transactions = transactionsQuery.data?.transactions ?? [];

  const selectProduct = (input: { id: string; priceMinor: number }) => {
    setProductId(input.id);
    setPrice(String(input.priceMinor / 100));
    setError(null);
  };

  const submitSale = () => {
    setError(null);
    const quantityNum = Number(quantity.trim());
    if (!productId) return setError("Pick a product");
    if (!Number.isInteger(quantityNum) || quantityNum <= 0)
      return setError("Enter how many were sold");
    const priceMinor = toMinorUnits(price);
    if (priceMinor === null) return setError("Enter a valid selling price");
    if (mode === "credit" && !customerId) return setError("Choose the customer for a credit sale");
    saleMutation.mutate({
      productId,
      quantity: quantityNum,
      unitPriceMinor: priceMinor,
      onCredit: mode === "credit",
      customerId: customerId ?? undefined,
    });
  };

  const chipClass = (selected: boolean) =>
    cn(
      "rounded-md border px-3 py-2",
      selected ? "border-accent bg-accent-tint" : "border-line bg-paper-card",
    );

  const chipTextClass = (selected: boolean) =>
    cn("text-sm", selected ? "font-medium text-accent" : "text-ink");

  return (
    <Screen>
      <View className="mt-2">
        <Text className="text-[11px] uppercase tracking-widest text-ink-faint">
          Sales · {tenant?.name}
        </Text>
        <Text className="mt-1 text-2xl font-semibold text-ink">Sales</Text>
      </View>

      {canTransact ? (
        <Button
          title={recording ? "Hide sale form" : "＋ Record a sale"}
          variant="secondary"
          onPress={() => setRecording(!recording)}
          className="mt-4 self-start"
        />
      ) : (
        <Text className="mt-4 text-xs font-medium text-ink-soft">
          Read-only access in this shop - you can watch sales but not record them.
        </Text>
      )}

      {recording ? (
        <View className="mt-4 gap-4 rounded-lg border border-line bg-paper-card p-4">
          <Text className="text-sm font-medium text-ink">New sale</Text>

          <View className="gap-1.5">
            <Text className="text-sm font-medium text-ink-soft">Product</Text>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={products}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const selected = productId === item.id;
                return (
                  <Pressable
                    onPress={() => selectProduct(item)}
                    disabled={item.stockQty <= 0}
                    className={cn(chipClass(selected), "mr-2")}>
                    <Text className={chipTextClass(selected)}>{item.name}</Text>
                    <Text className="mt-0.5 text-xs text-ink-soft">
                      {formatMoney(item.priceMinor)} · {item.stockQty} left
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>

          <View className="flex-row gap-3">
            <Field
              label="Quantity"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
              placeholder="1"
              className="flex-1"
            />
            <Field
              label="Unit price (naira)"
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              placeholder="0"
              className="flex-1"
            />
          </View>

          <View className="flex-row gap-3">
            <Button
              title="Cash"
              variant={mode === "cash" ? "primary" : "secondary"}
              onPress={() => {
                setMode("cash");
                setError(null);
              }}
              className="flex-1"
            />
            <Button
              title="On credit"
              variant={mode === "credit" ? "primary" : "secondary"}
              onPress={() => {
                setMode("credit");
                setError(null);
              }}
              className="flex-1"
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-sm font-medium text-ink-soft">
              {mode === "credit" ? "Customer (required)" : "Customer (optional)"}
            </Text>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={customers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const selected = customerId === item.id;
                return (
                  <Pressable
                    onPress={() => {
                      setCustomerId(selected ? null : item.id);
                      setError(null);
                    }}
                    className={cn(chipClass(selected), "mr-2")}>
                    <Text className={chipTextClass(selected)}>{item.name}</Text>
                    {item.debtMinor > 0 ? (
                      <Text className="mt-0.5 text-xs text-danger">
                        owes {formatMoney(item.debtMinor)}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </View>

          {error ? <Text className="text-sm text-danger">{error}</Text> : null}

          <Button title="Record sale" onPress={submitSale} disabled={saleMutation.isPending} />
        </View>
      ) : null}

      <Text className="mt-6 mb-2 text-[11px] uppercase tracking-widest text-ink-faint">
        Recent activity
      </Text>

      {transactionsQuery.isError ? (
        <EmptyState
          title="Could not load activity"
          body={
            transactionsQuery.error instanceof ApiError
              ? transactionsQuery.error.message
              : "Something went wrong."
          }
        />
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={transactionsQuery.isRefetching}
              onRefresh={() => void transactionsQuery.refetch()}
              tintColor="#1E5A3B"
            />
          }
          ListEmptyComponent={
            transactionsQuery.isLoading ? null : (
              <EmptyState
                title="No sales yet"
                body="When you sell - cash or on credit - it shows up here, and what a customer owes updates automatically."
              />
            )
          }
          renderItem={({ item }) => (
            <View className="mb-2 flex-row items-center justify-between rounded-lg border border-line bg-paper-card px-4 py-3">
              <View className="flex-1 pr-3">
                {item.type === "SALE" ? (
                  <>
                    <Text className="text-sm font-medium text-ink">
                      {item.product?.name ?? "Product"}
                      {item.onCredit ? (
                        <Text className="text-danger"> · credit</Text>
                      ) : null}
                    </Text>
                    <Text className="mt-0.5 text-xs text-ink-soft">
                      {item.quantity} × {formatMoney(item.unitPriceMinor ?? 0)}
                      {item.customer ? ` · ${item.customer.name}` : ""}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text className="text-sm font-medium text-ink">
                      Payment{item.customer ? ` · ${item.customer.name}` : ""}
                    </Text>
                    <Text className="mt-0.5 text-xs text-ink-soft">
                      Received {formatDateTime(item.createdAt)}
                    </Text>
                  </>
                )}
              </View>
              <AmountText
                amount={item.amountMinor}
                tone={item.type === "PAYMENT" ? "owed" : "default"}
                size="sm"
              />
            </View>
          )}
        />
      )}
    </Screen>
  );
}