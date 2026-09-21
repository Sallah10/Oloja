import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { MembershipRole } from "@/lib/types";

export default function InviteScreen() {
  const router = useRouter();
  const { isSignedIn, switchShop } = useAuth();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) return setError("Enter the invite code from the shop owner");
    setBusy(true);
    setError(null);
    try {
      const accepted = await api<{ tenant: { id: string; name: string }; role: MembershipRole }>(
        "/api/invites/accept",
        { method: "POST", body: { code: trimmed } },
      );
      if (accepted.tenant.id) {
        await switchShop(accepted.tenant.id);
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't join that shop right now");
      setBusy(false);
    }
  };

  if (!isSignedIn) return <Redirect href="/login" />;

  return (
    <Screen scroll>
      <View className="flex-row items-center justify-between">
        <Text className="text-2xl font-semibold text-ink">Join a shop</Text>
        <BackLink />
      </View>

      <Text className="mt-2 text-sm text-ink-soft">
        Someone shared a code with you. Enter it here and you will switch straight into their shop
        as staff.
      </Text>

      <View className="mt-6 rounded-lg border border-line bg-paper-card p-4">
        <Field
          label="Invite code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={16}
          placeholder="e.g. STALL7KD"
          editable={!busy}
          onSubmitEditing={submit}
          returnKeyType="done"
        />
        {error ? <Text className="mt-3 text-sm text-danger">{error}</Text> : null}
        <Button
          title={busy ? "Joining…" : "Join this shop"}
          onPress={submit}
          disabled={busy}
          className="mt-5"
        />
      </View>

      <Text className="mt-4 text-xs text-ink-faint">
        Codes stop working once used or expired. You can always go back to your own shop from the
        shop switcher.
      </Text>
    </Screen>
  );
}