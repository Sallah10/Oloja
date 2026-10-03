import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
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
        <Text display weight="semibold" className="text-2xl text-ink">
          Join a shop
        </Text>
        <BackLink />
      </View>

      <View className="mt-2 flex-row items-start gap-3">
        <View className="mt-0.5 h-8 w-8 items-center justify-center rounded-xl border border-accent/15 bg-accent-deep">
          <Text display weight="bold" className="text-sm text-white">
            O
          </Text>
        </View>
        <Text className="flex-1 text-sm leading-5 text-ink-soft">
          Someone shared a code with you. Enter it and this device switches straight into their
          shop as staff.
        </Text>
      </View>

      <Card className="mt-6 p-5">
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
        {error ? <Text className="mt-3 text-sm text-danger-deep">{error}</Text> : null}
        <Button
          title={busy ? "Joining…" : "Join this shop"}
          onPress={submit}
          disabled={busy}
          className="mt-5"
        />
      </Card>

      <Text className="mt-4 text-xs leading-4 text-ink-faint">
        Codes stop working once used or expired. You can always go back to your own shop from the
        shop switcher in Settings.
      </Text>
    </Screen>
  );
}