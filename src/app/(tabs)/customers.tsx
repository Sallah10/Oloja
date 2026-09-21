import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
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
import { toMinorUnits } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { CustomerSummary, DebtEntry } from "@/lib/types";

export default function CustomersScreen() {
  const { tenant, canTransact } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [payOpenFor, setPayOpenFor] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);

  const invalidateCustomers = () =>
    queryClient.invalidateQueries({ queryKey: ["customers"] });

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
      setAddOpen(false);
      setFormError(null);
      void invalidateCustomers();
    },
    onError: (err) =>
      setFormError(err instanceof ApiError ? err.message : "Could not add customer"),
  });

  const payMutation = useMutation({
    mutationFn: (input: { customerId: string; amountMinor: number }) =>
      api("/api/payments", { method: "POST", body: input }),
    onSuccess: () => {
      setPayOpenFor(null);
      setPayAmount("");
      setPayError(null);
      void invalidateCustomers();
      if (openId) {
        void queryClient.invalidateQueries({ queryKey: ["customer-debt", openId] });
      }
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (err) =>
      setPayError(err instanceof ApiError ? err.message : "Could not record payment"),
  });

  const customers = listQuery.data?.customers ?? [];
  const entries = detailQuery.data?.entries ?? [];

  const submitAdd = () => {
    if (!name.trim()) return setFormError("Give the customer a name");
    addMutation.mutate({ name: name.trim(), phone: phone.trim() || undefined });
  };

  const submitPayment = (customerId: string) => {
    const amountMinor = toMinorUnits(payAmount);
    if (amountMinor === null || amountMinor <= 0) {
      return setPayError("Enter a valid amount");
    }
    payMutation.mutate({ customerId, amountMinor });
  };

  const toggle = (id: string) => {
    setOpenId(openId === id ? null : id);
    setPayOpenFor(null);
    setPayError(null);
  };

  return (
    <Screen>
      <View className="mt-2">
        <Text className="text-[11px] uppercase tracking-widest text-ink-faint">
          Customers · {tenant?.name}
        </Text>
        <Text className="mt-1 text-2xl font-semibold text-ink">Customers</Text>
      </View>

      {addOpen ? (
        <View className="mt-4 gap-4 rounded-lg border border-line bg-paper-card p-4">
          <Text className="text-sm font-medium text-ink">Add a customer</Text>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ada Okafor"
          />
          <Field
            label="Phone (optional)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="e.g. 08012345678"
          />
          {formError ? <Text className="text-sm text-danger">{formError}</Text> : null}
          <View className="flex-row gap-3">
            <Button
              title="Save customer"
              onPress={submitAdd}
              disabled={addMutation.isPending}
              className="flex-1"
            />
            <Button title="Cancel" variant="secondary" onPress={() => setAddOpen(false)} />
          </View>
        </View>
      ) : canTransact ? (
        <Button
          title="＋ Add customer"
          variant="secondary"
          onPress={() => setAddOpen(true)}
          className="mt-4 self-start"
        />
      ) : null}

      <Text className="mt-6 mb-2 text-[11px] uppercase tracking-widest text-ink-faint">
        What your customers owe
      </Text>

      {listQuery.isError ? (
        <EmptyState
          title="Could not load customers"
          body={
            listQuery.error instanceof ApiError ? listQuery.error.message : "Something went wrong."
          }
        />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={listQuery.isRefetching}
              onRefresh={() => void listQuery.refetch()}
              tintColor="#1E5A3B"
            />
          }
          ListEmptyComponent={
            listQuery.isLoading ? null : (
              <EmptyState
                title="Nobody owes you yet"
                body="When someone takes goods on credit, they get a page here with their balance and every payment they've made."
              />
            )
          }
          renderItem={({ item }) => {
            const open = openId === item.id;
            const inDebt = item.debtMinor > 0;
            return (
              <View className="mb-2 rounded-lg border border-line bg-paper-card">
                <Pressable onPress={() => toggle(item.id)} className="px-4 py-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-base font-medium text-ink">{item.name}</Text>
                      {item.phone ? (
                        <Text className="mt-0.5 text-xs text-ink-soft">{item.phone}</Text>
                      ) : null}
                    </View>
                    <View className="items-end">
                      <AmountText
                        amount={Math.abs(item.debtMinor)}
                        tone={inDebt ? "debt" : "soft"}
                        size="sm"
                      />
                      <Text className="text-[11px] uppercase tracking-wide text-ink-faint">
                        {inDebt ? "owed" : "paid up"}
                      </Text>
                    </View>
                  </View>
                </Pressable>

                {open ? (
                  <View className="border-t border-line px-4 py-3">
                    {payOpenFor === item.id ? (
                      <View className="gap-3">
                        <Field
                          label="Payment received (naira)"
                          value={payAmount}
                          onChangeText={setPayAmount}
                          keyboardType="numeric"
                          placeholder="e.g. 5000"
                        />
                        {payError ? <Text className="text-sm text-danger">{payError}</Text> : null}
                        <View className="flex-row gap-3">
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
                              setPayOpenFor(null);
                              setPayAmount("");
                              setPayError(null);
                            }}
                          />
                        </View>
                      </View>
                    ) : canTransact ? (
                      <View className="flex-row items-center gap-2">
                        <Button
                          title="Record a payment"
                          variant="secondary"
                          onPress={() => {
                            setPayOpenFor(item.id);
                            setPayAmount("");
                            setPayError(null);
                          }}
                          className="flex-1"
                        />
                        <Button
                          title="Edit"
                          variant="secondary"
                          onPress={() => router.push(`/customer/${item.id}`)}
                        />
                      </View>
                    ) : (
                      <View className="flex-row items-center gap-2">
                        <Button
                          title="Edit"
                          variant="secondary"
                          onPress={() => router.push(`/customer/${item.id}`)}
                        />
                      </View>
                    )}

                    <Text className="mt-4 mb-1 text-[11px] uppercase tracking-widest text-ink-faint">
                      Debt ledger
                    </Text>
                    {detailQuery.isLoading ? (
                      <Text className="text-sm text-ink-soft">Loading…</Text>
                    ) : entries.length === 0 && detailQuery.isFetched ? (
                      <Text className="text-sm text-ink-soft">No entries yet.</Text>
                    ) : (
                      entries.map((entry) => (
                        <View
                          key={entry.id}
                          className="flex-row items-center justify-between border-t border-line py-2">
                          <View className="flex-1 pr-3">
                            <Text className="text-sm text-ink">
                              {entry.type === "CREDIT" ? "Goods on credit" : "Payment received"}
                            </Text>
                            <Text className="mt-0.5 text-xs text-ink-soft">
                              {formatDateTime(entry.createdAt)}
                            </Text>
                          </View>
                          <AmountText
                            amount={Math.abs(entry.amountMinor)}
                            tone={entry.type === "CREDIT" ? "debt" : "owed"}
                            size="sm"
                          />
                        </View>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}