import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";

import { AmountText } from "@/components/ui/amount-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text as T } from "@/components/ui/text";
import { useFeedback } from "@/components/feedback";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/errors";
import { salesToday } from "@/lib/insights";
import { formatMoney } from "@/lib/money";
import { dayGroupLabel, formatTimeOfDay } from "@/lib/time";
import { CustomerSummary, ProductSummary, TransactionSummary } from "@/lib/types";

type PayMode = "cash" | "credit";

type TxGroup = { key: string; title: string; items: TransactionSummary[] };

function groupTransactions(transactions: TransactionSummary[]): TxGroup[] {
  const sorted = [...transactions].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const groups: TxGroup[] = [];
  for (const t of sorted) {
    const title = dayGroupLabel(t.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.items.push(t);
    else groups.push({ key: title, title, items: [t] });
  }
  return groups;
}

export default function SalesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ new?: string }>();
  const { tenant, canTransact } = useAuth();
  const queryClient = useQueryClient();
  const feedback = useFeedback();

  const [manualRecord, setManualRecord] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [mode, setMode] = useState<PayMode>("cash");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);

  // A deep link / dashboard "Record a sale" lands on this tab with ?new=1 and
  // jumps straight into the form. The param is consumed (cleared) here so a web
  // refresh stays closed; opening is derived from the param, no state to mirror.
  useEffect(() => {
    if (params.new === "1") router.setParams({ new: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.new]);

  const recording = params.new === "1" || manualRecord;
  const closeRecord = () => {
    setManualRecord(false);
    if (params.new) router.setParams({ new: undefined });
  };

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
    onSuccess: (_data, input) => {
      const total = input.quantity * input.unitPriceMinor;
      closeRecord();
      setProductId(null);
      setQuantity(1);
      setCustomerId(null);
      setError(null);
      feedback.show(`Sale recorded · ${formatMoney(total)}`, "success");
      invalidateAll();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not record this sale"),
  });

  const addCustomerMutation = useMutation({
    mutationFn: (input: { name: string; phone?: string }) =>
      api<{ id: string }>("/api/customers", { method: "POST", body: input }),
    onSuccess: (data) => {
      setCustomerId(data.id);
      setAddingCustomer(false);
      setNewName("");
      setNewPhone("");
      setNewCustomerError(null);
      feedback.show("Customer added", "success");
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err) =>
      setNewCustomerError(err instanceof ApiError ? err.message : "Could not add customer"),
  });

  const products = useMemo(() => productsData?.products ?? [], [productsData]);
  const customers = useMemo(() => customersQuery.data?.customers ?? [], [customersQuery.data]);
  const transactions = useMemo(
    () => transactionsQuery.data?.transactions ?? [],
    [transactionsQuery.data],
  );
  const groups = useMemo(() => groupTransactions(transactions), [transactions]);
  const today = salesToday(transactions);

  const selectedProduct = products.find((p) => p.id === productId) ?? null;
  const priceMinor = selectedProduct?.priceMinor ?? 0;
  const totalMinor = priceMinor * quantity;

  const selectProduct = (id: string) => {
    setProductId(id);
    setQuantity(1);
    setError(null);
  };

  const submitSale = () => {
    setError(null);
    if (!selectedProduct) return setError("Pick a product first");
    if (quantity <= 0) return setError("Enter how many were sold");
    if (mode === "credit" && !customerId) return setError("Choose who is buying on credit");
    saleMutation.mutate({
      productId: selectedProduct.id,
      quantity,
      unitPriceMinor: priceMinor,
      onCredit: mode === "credit",
      customerId: customerId ?? undefined,
    });
  };

  const submitNewCustomer = () => {
    setNewCustomerError(null);
    if (!newName.trim()) return setNewCustomerError("Give the customer a name");
    addCustomerMutation.mutate({ name: newName.trim(), phone: newPhone.trim() || undefined });
  };

  const header = (
    <View>
      <ScreenHeader
        eyebrow={`Sales · ${tenant?.name ?? ""}`}
        title="Sales"
        subtitle="Sell in three taps - cash or on credit - and watch the day's story."
      />

      {today.count > 0 ? (
        <Card flat className="mt-4 flex-row items-center justify-between px-4 py-3">
          <View className="flex-row items-center gap-2.5">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-tint">
              <Ionicons name="sunny-outline" size={17} color="#1F5D3C" />
            </View>
            <T className="text-sm text-ink-soft">Today so far</T>
          </View>
          <View className="items-end">
            <AmountText amount={today.amountMinor} size="base" />
            <T className="text-xs text-ink-faint">
              {today.count} sale{today.count === 1 ? "" : "s"}
            </T>
          </View>
        </Card>
      ) : null}

      {canTransact ? (
        <Button
          title={recording ? "Close the sale form" : "Record a sale"}
          icon={recording ? "close" : "add"}
          size="lg"
          variant={recording ? "secondary" : "primary"}
          onPress={() => (recording ? closeRecord() : setManualRecord(true))}
          className="mt-4"
        />
      ) : (
        <View className="mt-4 rounded-2xl border border-line bg-paper-card px-4 py-3">
          <T className="text-sm text-ink-soft">
            You can watch the ledger, but only owners and staff can record sales here.
          </T>
        </View>
      )}

      {recording ? (
        <View className="mt-4 rounded-2xl border border-line bg-paper-card p-4">
          <View className="flex-row items-center justify-between">
            <T display weight="semibold" className="text-lg text-ink">
              New sale
            </T>
            <T className="text-xs text-ink-faint">Step by step</T>
          </View>

          <View className="mt-4 gap-2.5">
            <StepLabel n={1} text="What did you sell?" />
            {products.length === 0 ? (
              <View className="rounded-xl border border-dashed border-line bg-paper px-3 py-4">
                <T className="text-sm text-ink-soft">
                  No products yet.{" "}
                  <T
                    weight="semibold"
                    className="text-accent-deep"
                    onPress={() => router.navigate({ pathname: "/inventory", params: { new: "1" } })}>
                    Add one
                  </T>{" "}
                  and it will appear here.
                </T>
              </View>
            ) : (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={products}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                renderItem={({ item }) => {
                  const selected = productId === item.id;
                  const out = item.stockQty <= 0;
                  return (
                    <Chip
                      label={item.name}
                      subtitle={`${formatMoney(item.priceMinor)} · ${out ? "out of stock" : `${item.stockQty} left`}`}
                      selected={selected}
                      disabled={out}
                      onPress={() => selectProduct(item.id)}
                    />
                  );
                }}
              />
            )}
          </View>

          {selectedProduct ? (
            <View className="mt-4 gap-2.5">
              <StepLabel n={2} text="How many?" />
              <View className="flex-row items-center gap-3">
                <Stepper value={quantity} onChange={setQuantity} />
                <View className="flex-1 items-end">
                  <T className="text-xs text-ink-faint">Total so far</T>
                  <AmountText amount={totalMinor} size="base" />
                </View>
              </View>
            </View>
          ) : null}

          {selectedProduct ? (
            <View className="mt-4 gap-2.5">
              <StepLabel n={3} text="Cash or credit?" />
              <View className="flex-row gap-2">
                <ModeButton
                  label="Cash"
                  icon="cash-outline"
                  selected={mode === "cash"}
                  onPress={() => {
                    setMode("cash");
                    setError(null);
                  }}
                />
                <ModeButton
                  label="On credit"
                  icon="time-outline"
                  selected={mode === "credit"}
                  onPress={() => {
                    setMode("credit");
                    setError(null);
                  }}
                />
              </View>
            </View>
          ) : null}

          {selectedProduct && mode === "credit" ? (
            <View className="mt-4 gap-2.5">
              <StepLabel n={4} text="Who&apos;s buying?" />
              {addingCustomer ? (
                <View className="rounded-xl border border-line bg-paper p-3">
                  <Field
                    label="Name"
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="e.g. Ada Okafor"
                    autoFocus
                  />
                  <Field
                    label="Phone (optional)"
                    value={newPhone}
                    onChangeText={setNewPhone}
                    keyboardType="phone-pad"
                    placeholder="e.g. 08012345678"
                    className="mt-2"
                  />
                  {newCustomerError ? <T className="mt-2 text-sm text-danger">{newCustomerError}</T> : null}
                  <View className="mt-3 flex-row gap-2">
                    <Button
                      title={addCustomerMutation.isPending ? "Adding…" : "Add customer"}
                      disabled={addCustomerMutation.isPending}
                      onPress={submitNewCustomer}
                      size="sm"
                      className="flex-1"
                    />
                    <Button
                      title="Cancel"
                      variant="secondary"
                      size="sm"
                      onPress={() => {
                        setAddingCustomer(false);
                        setNewCustomerError(null);
                      }}
                    />
                  </View>
                </View>
              ) : customers.length === 0 ? (
                <View className="rounded-xl border border-dashed border-line bg-paper px-3 py-4">
                  <T className="text-sm text-ink-soft">
                    No customers yet -{" "}
                    <T
                      weight="semibold"
                      className="text-accent-deep"
                      onPress={() => {
                        setAddingCustomer(true);
                        setError(null);
                      }}>
                      add the first one
                    </T>{" "}
                    here and their balance has a home.
                  </T>
                </View>
              ) : (
                <>
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={customers}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                    ListFooterComponent={
                      <Chip label="+ Add new" subtitle="then it's selected" onPress={() => setAddingCustomer(true)} />
                    }
                    renderItem={({ item }) => {
                      const selected = customerId === item.id;
                      return (
                        <Chip
                          label={item.name}
                          subtitle={
                            item.debtMinor > 0 ? `owes ${formatMoney(item.debtMinor)}` : "all paid up"
                          }
                          selected={selected}
                          onPress={() => {
                            setCustomerId(selected ? null : item.id);
                            setError(null);
                          }}
                        />
                      );
                    }}
                  />
                  <T className="px-1 text-xs text-ink-faint">
                    The one you pick gets this credit added to their balance.
                  </T>
                </>
              )}
            </View>
          ) : null}

          {error ? (
            <View className="mt-3 rounded-xl border border-danger/30 bg-danger-tint px-3 py-2.5">
              <T className="text-sm text-danger-deep">{error}</T>
            </View>
          ) : null}

          <Button
            title={
              saleMutation.isPending
                ? "Recording…"
                : selectedProduct
                  ? `Record sale · ${formatMoney(totalMinor)}`
                  : "Record sale"
            }
            onPress={submitSale}
            disabled={saleMutation.isPending}
            className="mt-4"
          />
        </View>
      ) : null}

      <View className="mt-6 mb-2.5 flex-row items-center justify-between">
        <T weight="semibold" className="text-[11px] uppercase tracking-[1.6px] text-ink-faint">
          Your sales
        </T>
        {transactions.length > 0 ? (
          <T className="text-xs text-ink-faint">{transactions.length} entry total</T>
        ) : null}
      </View>
    </View>
  );

  return (
    <Screen>
      <FlatList
        className="flex-1"
        data={groups}
        keyExtractor={(g) => g.key}
        ListHeaderComponent={header}
        ListEmptyComponent={
          transactionsQuery.isLoading ? null : (
            <EmptyState
              icon="receipt-outline"
              title="No sales yet"
              body="The first sale - cash or on credit - starts your ledger. It shows up here, and a customer's balance updates on its own."
              tip="Tap “Record a sale” above when you're ready."
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={transactionsQuery.isRefetching}
            onRefresh={() => void transactionsQuery.refetch()}
            tintColor="#1F5D3C"
            colors={["#1F5D3C"]}
          />
        }
        contentContainerStyle={{ paddingBottom: 28 }}
        renderItem={({ item: group }) => (
          <View className="mb-2">
            <T weight="medium" className="mb-2 mt-1 text-sm text-ink-soft">
              {group.title}
            </T>
            <View className="gap-2">
              {group.items.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <T weight="semibold" className="text-sm tracking-wide text-ink-soft">
      <T className="text-accent-deep">{n}</T> · {text}
    </T>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View className="flex-row items-center overflow-hidden rounded-xl border border-line bg-paper-card">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        onPress={() => onChange(Math.max(1, value - 1))}
        className="h-12 w-12 items-center justify-center border-r border-line active:bg-paper">
        <Ionicons name="remove" size={20} color="#1F5D3C" />
      </Pressable>
      <T weight="semibold" className="min-w-[52px] text-center text-lg tabular-nums text-ink">
        {value}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        onPress={() => onChange(value + 1)}
        className="h-12 w-12 items-center justify-center border-l border-line active:bg-paper">
        <Ionicons name="add" size={20} color="#1F5D3C" />
      </Pressable>
    </View>
  );
}

function ModeButton({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={cn(
        "flex-1 flex-row items-center justify-center gap-2 rounded-xl border py-3.5",
        selected ? "border-accent bg-accent-tint" : "border-line bg-paper-card",
      )}>
      <Ionicons name={icon} size={18} color={selected ? "#16452F" : "#7A6E5A"} />
      <T weight={selected ? "semibold" : "normal"} className={selected ? "text-accent-deep" : "text-ink"}>
        {label}
      </T>
    </Pressable>
  );
}

function TransactionRow({ tx }: { tx: TransactionSummary }) {
  const isSale = tx.type === "SALE";
  return (
    <Card flat className="flex-row items-center gap-3 px-4 py-3">
      <View
        className={cn(
          "h-10 w-10 items-center justify-center rounded-full",
          isSale ? "bg-accent-tint" : "bg-accent-tint2",
        )}>
        <Ionicons name={isSale ? "receipt-outline" : "wallet-outline"} size={18} color="#1F5D3C" />
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <T weight="semibold" className="flex-1 text-[15px] text-ink" numberOfLines={1}>
            {isSale ? tx.product?.name ?? "Sale" : "Payment received"}
          </T>
          {isSale && tx.onCredit ? <Badge tone="danger" label="credit" /> : null}
        </View>
        <T className="mt-0.5 text-xs text-ink-soft">
          {isSale
            ? `${tx.quantity} × ${formatMoney(tx.unitPriceMinor ?? 0)}${tx.customer ? ` · ${tx.customer.name}` : ""}`
            : `${tx.customer?.name ?? "Cash"} · ${formatTimeOfDay(tx.createdAt)}`}
        </T>
      </View>
      <AmountText
        amount={isSale ? tx.amountMinor : Math.abs(tx.amountMinor)}
        tone={isSale ? "default" : "owed"}
        size="sm"
        className="shrink-0"
      />
    </Card>
  );
}