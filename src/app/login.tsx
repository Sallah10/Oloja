import { Redirect } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
import { useAuth } from "@/context/auth-context";
import { ApiError } from "@/lib/api";

export default function LoginScreen() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [tenantName, setTenantName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Redirect href="/" />;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        await signUp({
          tenantName: tenantName.trim(),
          ownerName: ownerName.trim(),
          email: email.trim(),
          password,
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen className="justify-center">
      <View className="w-full items-center">
        <View className="w-full max-w-md">
          <Text className="text-[11px] uppercase tracking-widest text-ink-faint">
            Oloja · ledger
          </Text>
          <Text className="mt-1 text-3xl font-semibold text-ink">
            {mode === "signin" ? "Sign in to your shop" : "Open your ledger"}
          </Text>
          <Text className="mt-1 text-sm text-ink-soft">
            {mode === "signin"
              ? "Your sales and debts are waiting."
              : "It takes a minute to set up your shop."}
          </Text>

          <View className="mt-8 gap-4">
            {mode === "signup" ? (
              <>
                <Field
                  label="Shop name"
                  value={tenantName}
                  onChangeText={setTenantName}
                  placeholder="e.g. Flora & Fume"
                />
                <Field
                  label="Your name"
                  value={ownerName}
                  onChangeText={setOwnerName}
                  placeholder="e.g. Grace Okoro"
                />
              </>
            ) : null}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder={mode === "signup" ? "At least 8 characters" : undefined}
            />
          </View>

          {error ? <Text className="mt-4 text-sm text-danger">{error}</Text> : null}

          <View className="mt-6">
            <Button
              title={mode === "signin" ? "Sign in" : "Create my ledger"}
              onPress={submit}
              disabled={submitting}
            />
          </View>

          <Button
            title={
              mode === "signin"
                ? "New shop owner? Create your ledger"
                : "Have a shop? Sign in instead"
            }
            variant="ghost"
            onPress={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="mt-2 self-center"
          />
        </View>
      </View>
    </Screen>
  );
}