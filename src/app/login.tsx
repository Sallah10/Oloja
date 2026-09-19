import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
import { useAuth } from "@/context/auth-context";
import { ApiError } from "@/lib/errors";
import { isMockMode } from "@/lib/api";
import { cn } from "@/lib/cn";

export default function LoginScreen() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [tenantName, setTenantName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
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
      <View className="w-full items-center px-4">
        <View className="w-full max-w-md">
          <View className="items-center">
            <View className="h-14 w-14 items-center justify-center rounded-xl bg-accent">
              <Text className="text-2xl font-bold text-white">O</Text>
            </View>
            <Text className="mt-3 text-2xl font-semibold tracking-tight text-ink">Oloja</Text>
            <Text className="mt-1 text-sm text-ink-soft">A quiet ledger for small shops.</Text>
          </View>

          {isMockMode ? (
            <View className="mt-4 items-center">
              <View className="rounded-full border border-line bg-paper-card px-3 py-1">
                <Text className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                  Demo mode — local data, no server
                </Text>
              </View>
            </View>
          ) : null}

          <View className="mt-8 rounded-xl border border-line bg-paper-card p-6">
            <Text className="text-xl font-semibold text-ink">
              {mode === "signin" ? "Sign in" : "Open your ledger"}
            </Text>
            <Text className="mt-1 text-sm text-ink-soft">
              {mode === "signin"
                ? "Your sales and debts are waiting."
                : "It takes a minute to set up your shop."}
            </Text>

            <View className="mt-6 gap-4">
              {mode === "signup" ? (
                <>
                  <Field
                    label="Shop name"
                    value={tenantName}
                    onChangeText={setTenantName}
                    placeholder="e.g. Flora & Fume"
                    editable={!submitting}
                  />
                  <Field
                    label="Your name"
                    value={ownerName}
                    onChangeText={setOwnerName}
                    placeholder="e.g. Grace Okoro"
                    editable={!submitting}
                  />
                </>
              ) : null}
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                editable={!submitting}
                onSubmitEditing={submit}
                returnKeyType="next"
              />
              <View className="gap-1.5">
                <Text className="text-sm font-medium text-ink-soft">Password</Text>
                <View>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder={mode === "signup" ? "At least 8 characters" : undefined}
                    placeholderTextColor="#A49D8E"
                    secureTextEntry={!showPassword}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    editable={!submitting}
                    onSubmitEditing={submit}
                    returnKeyType="done"
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    className={cn(
                      "h-12 rounded-md border bg-paper-card pr-16 pl-3 text-base text-ink",
                      passwordFocused ? "border-accent" : "border-line",
                    )}
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-0 h-12 justify-center"
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={showPassword ? "#A49D8E" : "#1E5A3B"}
                    />
                  </Pressable>
                </View>
              </View>
            </View>

            {error ? (
              <View className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2">
                <Text className="text-sm text-danger">{error}</Text>
              </View>
            ) : null}

            <View className="mt-6">
              <Button
                title={
                  submitting
                    ? mode === "signin"
                      ? "Signing in…"
                      : "Creating your ledger…"
                    : mode === "signin"
                      ? "Sign in"
                      : "Create my ledger"
                }
                onPress={submit}
                disabled={submitting}
              />
            </View>
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
              setShowPassword(false);
            }}
            className="mt-3 self-center"
          />

          <Text className="mt-6 text-center text-xs text-ink-faint">
            Single shop, one quiet ledger. Sessions are saved on this device, so the app opens straight to your shop.
          </Text>
        </View>
      </View>
    </Screen>
  );
}