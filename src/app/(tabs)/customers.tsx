import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";

import { AmountText } from "@/components/ui/amount-text";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
import { ScreenHeader } from "@/components/ui/screen-header";
import { Text as T } from "@/components/ui/text";
import { useFeedback } from "@/components/feedback";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { biggestDebtor, totalOwed } from "@/lib/insights";
import { formatMoney, toMinorUnits } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { CustomerSummary, DebtEntry } from "@/lib/types";

export default function CustomersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ new?: string }>();
  const { tenant, canTransact } = useAuth();
  const queryClient = useQueryClient();
  const feedback = useFeedback();

  const [manualAdd, setManualAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);

  // "Add one"/new-customer links land here with ?new=1 and open the form. The
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

  const invalidateCustomers = () => queryClient.invalidateQueries({ queryKey: ["customers"] });

  const listQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => api<{ customers: CustomerSummary[] }>("/api/customers"),
  });

  const detailQuery = useQuery({
    queryKey: ["customer-debt", openId],
    enabled: openId !== null,
    queryFn: () =>
      api<{ entries: DebtEntry[]; debtMinor: number }>(`/api/customers/${openId}/debt`),
  });

  const addMutation = useMutation({
    mutationFn: (input: { name: string; phone?: string }) =>
      api<{ id: string }>("/api/customers", { method: "POST", body: input }),
    onSuccess: () => {
      setName("");
      setPhone("");
      closeAdd();
      setFormError(null);
      feedback.show("Customer added", "success");
      invalidateCustomers();
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : "Could not add customer"),
  });

  const payMutation = useMutation({
    mutationFn: (input: { customerId: string; amountMinor: number }) =>
      api("/api/payments", { method: "POST", body: input }),
    onSuccess: (_data, input) => {
      setPayFor(null);
      setPayAmount("");
      setPayError(null);
      feedback.show(`Payment received · ${formatMoney(input.amountMinor)}`, "success");
      invalidateCustomers();
      if (openId) void queryClient.invalidateQueries({ queryKey: ["customer-debt", openId] });
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (err) => setPayError(err instanceof ApiError ? err.message : "Could not record payment"),
  });

  const customers = useMemo(() => listQuery.data?.customers ?? [], [listQuery.data]);
  const entries = detailQuery.data?.entries ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? customers.filter(
          (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q),
        )
      : customers;
    return [...base].sort((a, b) => b.debtMinor - a.debtMinor);
  }, [customers, query]);

  const owed = totalOwed(customers);
  const owedCount = customers.filter((c) => c.debtMinor > 0).length;
  const topDebtor = biggestDebtor(customers);

  const submitAdd = () => {
    if (!name.trim()) return setFormError("Give the customer a name");
    addMutation.mutate({ name: name.trim(), phone: phone.trim() || undefined });
  };

  const submitPayment = (customerId: string) => {
    const amountMinor = toMinorUnits(payAmount);
    if (amountMinor === null || amountMinor <= 0) return setPayError("Enter a valid amount");
    setPayAmount("");
    payMutation.mutate({ customerId, amountMinor });
  };

  const toggle = (id: string) => {
    setOpenId(openId === id ? null : id);
    setPayFor(null);
    setPayError(null);
  };

  const header = (
    <View>
      <ScreenHeader
        eyebrow={`Customers · ${tenant?.name ?? ""}`}
        title="Customers"
        subtitle="Credit is where a small shop grows - and also where it leaks. This keeps it honest."
      />

      <Card flat className="mt-4 flex-row items-center gap-3 px-4 py-3">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent-tint">
          <Ionicons name="wallet" size={18} color="#1F5D3C" />
        </View>
        <View className="flex-1">
          <T className="text-xs text-ink-faint">You&apos;re owed</T>
          <AmountText amount={owed} size="base" />
        </View>
        <View className="items-end">
          <T className="text-xs text-ink-soft">
            {owedCount === 0 ? "all paid up" : `${owedCount} owe you`}
          </T>
          {topDebtor ? (
            <T className="mt-0.5 text-xs text-ink-faint">
              {topDebtor.name} owes most
            </T>
          ) : null}
        </View>
      </Card>

      {addOpen ? (
        <View className="mt-4 rounded-2xl border border-line bg-paper-card p-4">
          <T display weight="semibold" className="text-lg text-ink">
            Add a customer
          </T>
          <View className="mt-4 gap-3">
            <Field
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Ada Okafor"
              autoFocus
            />
            <Field
              label="Phone (optional)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="e.g. 08012345678"
            />
          </View>
          {formError ? <T className="mt-3 text-sm text-danger">{formError}</T> : null}
          <View className="mt-4 flex-row gap-2">
            <Button
              title="Save customer"
              onPress={submitAdd}
              disabled={addMutation.isPending}
              className="flex-1"
            />
            <Button title="Cancel" variant="secondary" onPress={closeAdd} />
          </View>
        </View>
      ) : canTransact ? (
        <Button
          title="Add customer"
          icon="person-add-outline"
          variant="secondary"
          onPress={() => setManualAdd(true)}
          className="mt-4"
        />
      ) : null}

      <View className="mt-4 gap-1.5">
        <View className="flex-row items-center gap-2 rounded-xl border border-line bg-paper-card px-3">
          <Ionicons name="search" size={18} color="#B3A78D" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search customers…"
            placeholderTextColor="#B3A78D"
            className="h-[48px] flex-1 text-base text-ink"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} accessibilityRole="button" hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#B3A78D" />
            </Pressable>
          ) : null}
        </View>
        <T className="px-1 text-xs text-ink-faint">Sorted by whom owes you most</T>
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
          listQuery.isLoading ? null : customers.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="Nobody owes you yet"
              body="When someone takes goods on credit, add them here and they get a page with their balance and every payment they've made."
              tip="Add the first customer and credit stops being memory work.">
              {canTransact ? (
                <Button
                  title="Add your first customer"
                  icon="person-add-outline"
                  onPress={() => setManualAdd(true)}
                />
              ) : null}
            </EmptyState>
          ) : (
            <EmptyState
              icon="search-outline"
              title="No one by that name"
              body="Try a different spelling, or clear the search to see everyone."
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={listQuery.isRefetching}
            onRefresh={() => void listQuery.refetch()}
            tintColor="#1F5D3C"
            colors={["#1F5D3C"]}
          />
        }
        contentContainerStyle={{ paddingBottom: 28 }}
        renderItem={({ item }) => {
          const open = openId === item.id;
          const inDebt = item.debtMinor > 0;
          return (
            <Card className="mb-2.5 overflow-hidden">
              <Pressable onPress={() => toggle(item.id)} className="px-4 py-3.5">
                <View className="flex-row items-center gap-3">
                  <Avatar name={item.name} />
                  <View className="min-w-0 flex-1">
                    <T weight="semibold" className="text-[15px] text-ink" numberOfLines={1}>
                      {item.name}
                    </T>
                    {item.phone ? (
                      <T className="mt-0.5 text-xs text-ink-soft">{item.phone}</T>
                    ) : (
                      <T className="mt-0.5 text-xs text-ink-faint">No phone number</T>
                    )}
                  </View>
                  <View className="items-end shrink-0">
                    {inDebt ? (
                      <>
                        <AmountText amount={item.debtMinor} tone="debt" size="sm" />
                        <T className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
                          owes you
                        </T>
                      </>
                    ) : (
                      <>
                        <T weight="semibold" className="text-sm text-accent-deep">
                          Paid up
                        </T>
                        <T className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
                          no balance
                        </T>
                      </>
                    )}
                  </View>
                  <Ionicons
                    name={open ? "chevron-up" : "chevron-down"}
                    size={16}
                    color="#B3A78D"
                  />
                </View>
              </Pressable>

              {open ? (
                <View className="border-t border-line px-4 py-4">
                  {payFor === item.id ? (
                    <View className="w-full">
                      <T className="text-sm text-ink-soft">Payment received (₦)</T>
                      <View className="mt-2 flex-row gap-2">
                        <QuickAmount
                          label={`Full · ${formatMoney(item.debtMinor)}`}
                          onPress={() => {
                            setPayAmount(String(item.debtMinor / 100));
                            setPayError(null);
                          }}
                        />
                        <QuickAmount
                          label="Half"
                          onPress={() => {
                            setPayAmount(String(Math.round(item.debtMinor / 2) / 100));
                            setPayError(null);
                          }}
                        />
                      </View>
                      <TextInput
                        value={payAmount}
                        onChangeText={setPayAmount}
                        keyboardType="numeric"
                        placeholder="Or type an amount"
                        placeholderTextColor="#B3A78D"
                        className="mt-2 h-[52px] rounded-xl border border-line bg-paper-card px-3 text-base text-ink"
                      />
                      {payError ? <T className="mt-2 text-sm text-danger">{payError}</T> : null}
                      <View className="mt-3 flex-row gap-2">
                        <Button
                          title="Save payment"
                          onPress={() => submitPayment(item.id)}
                          disabled={payMutation.isPending}
                          className="flex-1"
                        />
                        <Button
                          title="Cancel"
                          variant="secondary"
                          onPress={() => {
                            setPayFor(null);
                            setPayAmount("");
                            setPayError(null);
                          }}
                        />
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row gap-2">
                      {canTransact ? (
                        <Button
                          title="Record a payment"
                          icon="wallet-outline"
                          variant="secondary"
                          onPress={() => {
                            setPayFor(item.id);
                            setPayAmount(inDebt ? String(item.debtMinor / 100) : "");
                            setPayError(null);
                          }}
                          className="flex-1"
                        />
                      ) : null}
                      <Button
                        title="Edit"
                        variant="secondary"
                        onPress={() => router.push(`/customer/${item.id}`)}
                      />
                    </View>
                  )}

                  <View className="mt-5 mb-1 flex-row items-center justify-between">
                    <T weight="semibold" className="text-[11px] uppercase tracking-[1.4px] text-ink-faint">
                      Balance ledger
                    </T>
                    <AmountText amount={Math.abs(item.debtMinor)} tone={inDebt ? "debt" : "owed"} size="sm" />
                  </View>

                  {detailQuery.isLoading ? (
                    <T className="mt-2 text-sm text-ink-soft">Loading…</T>
                  ) : entries.length === 0 && detailQuery.isFetched ? (
                    <T className="mt-2 text-sm text-ink-soft">No entries yet.</T>
                  ) : (
                    entries.map((entry) => <LedgerRow key={entry.id} entry={entry} />)
                  )}
                </View>
              ) : null}
            </Card>
          );
        }}
      />
    </Screen>
  );
}

function QuickAmount({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-full border border-line bg-paper-card px-3 py-2 active:opacity-75">
      <T className="text-xs font-medium text-accent-deep">{label}</T>
    </Pressable>
  );
}

function LedgerRow({ entry }: { entry: DebtEntry }) {
  const isCredit = entry.type === "CREDIT";
  return (
    <View className="flex-row items-center justify-between border-t border-line py-2.5">
      <View className="flex-1 pr-3">
        <T className="text-sm text-ink">{isCredit ? "Goods on credit" : entry.type === "PAYMENT" ? "Payment received" : "Balance adjusted"}</T>
        <T className="mt-0.5 text-xs text-ink-soft">{formatDateTime(entry.createdAt)}</T>
      </View>
      <AmountText amount={Math.abs(entry.amountMinor)} tone={isCredit ? "debt" : "owed"} size="sm" />
    </View>
  );
}