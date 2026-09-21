import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { AmountText } from "@/components/ui/amount-text";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { formatDateTime } from "@/lib/time";
import { CustomerSummary, DebtEntry } from "@/lib/types";

type Draft = { name: string; phone: string };

const toDraft = (c: CustomerSummary): Draft => ({
  name: c.name,
  phone: c.phone ?? "",
});

export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isSignedIn, canTransact } = useAuth();
  const queryClient = useQueryClient();

  // A draft holds the user's in-progress edits. Until the first keystroke it
  // stays null and the form renders the server values straight from the query.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

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
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
    },
    onError: (err) =>
      setEditError(err instanceof ApiError ? err.message : "Could not save changes"),
  });

  const submitEdit = () => {
    const current = draft ?? (customer ? toDraft(customer) : null);
    if (!current) return;
    if (!current.name.trim()) return setEditError("Give the customer a name");
    editMutation.mutate({ name: current.name.trim(), phone: current.phone.trim() || undefined });
  };

  if (!isSignedIn) return <Redirect href="/login" />;

  const entries = debtQuery.data?.entries ?? [];

  return (
    <Screen scroll>
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 pr-3 text-2xl font-semibold text-ink">
          {customer?.name ?? "Customer"}
        </Text>
        <BackLink />
      </View>

      {customerQuery.isError ? (
        <Text className="mt-4 text-sm text-danger">
          {customerQuery.error instanceof ApiError
            ? customerQuery.error.message
            : "Could not load this customer."}
        </Text>
      ) : null}

      {customer ? (
        <View className="mt-5 gap-4">
          <View className="flex-row items-center justify-between rounded-lg border border-line bg-paper-card px-4 py-3">
            <View>
              <Text className="text-[11px] uppercase tracking-widest text-ink-faint">Balance</Text>
              <AmountText
                amount={Math.abs(customer.debtMinor)}
                tone={customer.debtMinor > 0 ? "debt" : "soft"}
                size="xl"
              />
            </View>
            <Text className="text-xs text-ink-faint">
              {customer.debtMinor > 0 ? "still owed" : "paid up"}
            </Text>
          </View>

          {canTransact ? (
            <View className="rounded-lg border border-line bg-paper-card p-4">
              <Text className="text-sm font-medium text-ink">Details</Text>
              <View className="mt-3 gap-3">
                <Field
                  label="Name"
                  value={fields?.name ?? ""}
                  onChangeText={(value) => setField("name", value)}
                />
                <Field
                  label="Phone"
                  value={fields?.phone ?? ""}
                  onChangeText={(value) => setField("phone", value)}
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
            </View>
          ) : (
            <Text className="text-xs font-medium text-ink-soft">
              Read-only access in this shop - you can watch the ledger but not change it.
            </Text>
          )}

          <View className="rounded-lg border border-line bg-paper-card overflow-hidden">
            <Text className="px-4 pt-4 text-[11px] uppercase tracking-widest text-ink-faint">
              Debt ledger
            </Text>
            {debtQuery.isLoading ? null : entries.length === 0 ? (
              <Text className="px-4 py-4 text-sm text-ink-soft">No entries yet.</Text>
            ) : (
              entries.map((entry) => (
                <View
                  key={entry.id}
                  className="flex-row items-center justify-between border-t border-line px-4 py-3">
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
        </View>
      ) : null}
    </Screen>
  );
}