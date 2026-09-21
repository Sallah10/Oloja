import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { AmountText } from "@/components/ui/amount-text";
import { Avatar } from "@/components/ui/avatar";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
import { useFeedback } from "@/components/feedback";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { formatMoney, toMinorUnits } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { CustomerSummary, DebtEntry } from "@/lib/types";

type Draft = { name: string; phone: string };

const toDraft = (c: CustomerSummary): Draft => ({ name: c.name, phone: c.phone ?? "" });

export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isSignedIn, canTransact } = useAuth();
  const queryClient = useQueryClient();
  const feedback = useFeedback();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);

  const customerQuery = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api<CustomerSummary>(`/api/customers/${id}`),
  });

  const customer = customerQuery.data;
  const fields = draft ?? (customer ? toDraft(customer) : null);

  const setField = (key: keyof Draft, value: string) =>
    setDraft((previous) => ({ ...(previous ?? toDraft(customer!)), [key]: value }));

  const debtQuery = useQuery({
    queryKey: ["customer-debt", id],
    queryFn: () => api<{ entries: DebtEntry[]; debtMinor: number }>(`/api/customers/${id}/debt`),
  });

  const editMutation = useMutation({
    mutationFn: (input: { name: string; phone?: string }) =>
      api(`/api/customers/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      setDraft(null);
      setEditError(null);
      feedback.show("Details saved", "success");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : "Could not save changes"),
  });

  const payMutation = useMutation({
    mutationFn: (input: { customerId: string; amountMinor: number }) =>
      api("/api/payments", { method: "POST", body: input }),
    onSuccess: (_data, input) => {
      setPayOpen(false);
      setPayAmount("");
      setPayError(null);
      feedback.show(`Payment received · ${formatMoney(input.amountMinor)}`, "success");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-debt", id] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (err) => setPayError(err instanceof ApiError ? err.message : "Could not record payment"),
  });

  const submitEdit = () => {
    const current = draft ?? (customer ? toDraft(customer) : null);
    if (!current) return;
    if (!current.name.trim()) return setEditError("Give the customer a name");
    editMutation.mutate({ name: current.name.trim(), phone: current.phone.trim() || undefined });
  };

  const submitPayment = () => {
    const amountMinor = toMinorUnits(payAmount);
    if (amountMinor === null || amountMinor <= 0) return setPayError("Enter a valid amount");
    setPayAmount("");
    payMutation.mutate({ customerId: id, amountMinor });
  };

  if (!isSignedIn) return <Redirect href="/login" />;

  const entries = debtQuery.data?.entries ?? [];
  const inDebt = (customer?.debtMinor ?? 0) > 0;

  return (
    <Screen scroll>
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-row items-center gap-3">
          {customer ? <Avatar name={customer.name} size={44} /> : null}
          <View className="min-w-0 flex-1">
            <Text display weight="semibold" className="text-2xl leading-7 text-ink" numberOfLines={2}>
              {customer?.name ?? "Customer"}
            </Text>
            {customer?.phone ? (
              <Text className="mt-0.5 text-sm text-ink-soft">{customer.phone}</Text>
            ) : null}
          </View>
        </View>
        <BackLink />
      </View>

      {customer ? (
        <View className="mt-5 gap-4">
          <View className="rounded-3xl border border-accent-deep bg-accent-deep px-5 py-5">
            <Text weight="semibold" className="text-[11px] uppercase tracking-[1.6px] text-white/60">
              Balance
            </Text>
            <AmountText amount={Math.abs(customer.debtMinor)} tone="hero" size="2xl" className="mt-1" />
            <View className="mt-3 flex-row items-center gap-2">
              <View
                className={
                  inDebt
                    ? "rounded-full bg-danger/90 px-2.5 py-1"
                    : "rounded-full bg-white/15 px-2.5 py-1"
                }>
                <Text weight="medium" className="text-xs text-white">
                  {inDebt ? "still owed" : "all paid up"}
                </Text>
              </View>
              <Text className="text-xs text-white/50">Ledger moves in + only</Text>
            </View>
          </View>

          {canTransact && !payOpen ? (
            <Button
              title={inDebt ? "Record a payment" : "Record a payment"}
              icon="wallet-outline"
              variant={inDebt ? "primary" : "secondary"}
              disabled={!inDebt}
              onPress={() => {
                setPayOpen(true);
                setPayAmount(inDebt ? String(customer.debtMinor / 100) : "");
                setPayError(null);
              }}
            />
          ) : null}

          {canTransact && payOpen ? (
            <View className="rounded-2xl border border-line bg-paper-card p-4">
              <Text weight="medium" className="text-sm text-ink-soft">
                Amount received (₦)
              </Text>
              <View className="mt-2 flex-row gap-2">
                <QuickAmount
                  label={`Full balance · ${formatMoney(customer.debtMinor)}`}
                  onPress={() => {
                    setPayAmount(String(customer.debtMinor / 100));
                    setPayError(null);
                  }}
                />
                <QuickAmount
                  label="Half"
                  onPress={() => {
                    setPayAmount(String(Math.round(customer.debtMinor / 2) / 100));
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
                className="mt-3 h-[52px] rounded-xl border border-line bg-paper-card px-3 text-base text-ink"
              />
              {payError ? <Text className="mt-2 text-sm text-danger">{payError}</Text> : null}
              <View className="mt-3 flex-row gap-2">
                <Button
                  title="Save payment"
                  onPress={submitPayment}
                  disabled={payMutation.isPending}
                  className="flex-1"
                />
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setPayOpen(false);
                    setPayAmount("");
                    setPayError(null);
                  }}
                />
              </View>
            </View>
          ) : null}

          {canTransact ? (
            <Card className="p-4">
              <Text weight="medium" className="text-base text-ink">
                Details
              </Text>
              <View className="mt-3 gap-3">
                <Field label="Name" value={fields?.name ?? ""} onChangeText={(v) => setField("name", v)} />
                <Field
                  label="Phone"
                  value={fields?.phone ?? ""}
                  onChangeText={(v) => setField("phone", v)}
                  keyboardType="phone-pad"
                  placeholder="Optional"
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
          ) : (
            <View className="rounded-2xl border border-line bg-paper-card px-4 py-3">
              <Text className="text-sm text-ink-soft">
                You can watch this ledger, but only owners and staff can record payments or edit.
              </Text>
            </View>
          )}

          <Card className="overflow-hidden">
            <View className="px-4 pt-4">
              <Text weight="semibold" className="text-[11px] uppercase tracking-[1.4px] text-ink-faint">
                Balance ledger
              </Text>
            </View>
            {debtQuery.isLoading ? (
              <Text className="px-4 py-4 text-sm text-ink-soft">Loading…</Text>
            ) : entries.length === 0 ? (
              <Text className="px-4 py-4 text-sm text-ink-soft">No entries yet.</Text>
            ) : (
              entries.map((entry) => (
                <View
                  key={entry.id}
                  className="flex-row items-center justify-between border-t border-line px-4 py-3">
                  <View className="flex-1 pr-3">
                    <Text className="text-sm text-ink">
                      {entry.type === "CREDIT"
                        ? "Goods on credit"
                        : entry.type === "PAYMENT"
                          ? "Payment received"
                          : "Balance adjusted"}
                    </Text>
                    <Text className="mt-0.5 text-xs text-ink-soft">{formatDateTime(entry.createdAt)}</Text>
                  </View>
                  <AmountText
                    amount={Math.abs(entry.amountMinor)}
                    tone={entry.type === "CREDIT" ? "debt" : "owed"}
                    size="sm"
                  />
                </View>
              ))
            )}
          </Card>
        </View>
      ) : customerQuery.isError ? (
        <Text className="mt-4 text-sm text-danger">
          {customerQuery.error instanceof ApiError
            ? customerQuery.error.message
            : "Could not load this customer."}
        </Text>
      ) : null}
    </Screen>
  );
}

function QuickAmount({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-full border border-line bg-paper-card px-3 py-2 active:opacity-75">
      <Text className="text-xs font-medium text-accent-deep">{label}</Text>
    </Pressable>
  );
}