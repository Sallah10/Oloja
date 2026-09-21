import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { Dispatch, SetStateAction, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
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
    <Screen scroll>
      <View className="flex-1 justify-center py-6">
        <View className="mx-auto w-full max-w-md items-center">
          <View className="items-center">
            <View className="h-20 w-20 items-center justify-center rounded-[24px] border border-accent/15 bg-accent-deep shadow-soft">
              <Text display weight="bold" className="text-4xl text-white">
                O
              </Text>
            </View>
            <Text display weight="semibold" className="mt-4 text-4xl text-ink">
              Oloja
            </Text>
            <Text className="mt-1.5 text-center text-base text-ink-soft">
              The quiet ledger for small shops.
            </Text>
            <Text className="mt-1 max-w-xs text-center text-sm leading-5 text-ink-faint">
              Sales, credit and stock - one honest notebook, in your pocket.
            </Text>
          </View>

          {isMockMode ? (
            <View className="mt-4 rounded-full border border-line bg-paper-card px-3 py-1">
              <View className="flex-row items-center gap-1.5">
                <View className="h-1.5 w-1.5 rounded-full bg-accent" />
                <Text className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                  Demo mode - local data, no server
                </Text>
              </View>
            </View>
          ) : null}

          <View className="mt-8 w-full rounded-2xl border border-line bg-paper-card p-6 shadow-soft">
            <Text display weight="semibold" className="text-xl text-ink">
              {mode === "signin" ? "Welcome back" : "Open your ledger"}
            </Text>
            <Text className="mt-1 text-sm leading-5 text-ink-soft">
              {mode === "signin"
                ? "Your sales and balances are waiting where you left them."
                : "It takes about a minute to set up your shop."}
            </Text>

            <View className="mt-5 gap-4">
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
              <PasswordField
                value={password}
                onChangeText={setPassword}
                showPassword={showPassword}
                setShowPassword={setShowPassword}
                focused={passwordFocused}
                setFocused={setPasswordFocused}
                submitting={submitting}
                onSubmit={submit}
                placeholder={mode === "signup" ? "At least 8 characters" : undefined}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </View>

            {error ? (
              <View className="mt-4 rounded-xl border border-danger/30 bg-danger-tint px-3 py-2.5">
                <Text className="text-sm text-danger-deep">{error}</Text>
              </View>
            ) : null}

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
              className="mt-6"
            />
          </View>

          <Button
            title={
              mode === "signin"
                ? "New shop owner? Create your ledger"
                : "Have a shop already? Sign in instead"
            }
            variant="ghost"
            onPress={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setShowPassword(false);
            }}
            className="mt-3 self-center"
          />

          <View className="mt-6 max-w-md">
            <Text className="text-center text-xs leading-4 text-ink-faint">
              Sessions stay on this device, so the app opens straight to your shop - even without
              signal.
            </Text>
            <Text className="mt-2 text-center text-xs leading-4 text-ink-faint">
              Part of a team? Sign in, then join a shop with its code from Settings.
            </Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

function PasswordField({
  value,
  onChangeText,
  showPassword,
  setShowPassword,
  focused,
  setFocused,
  submitting,
  onSubmit,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChangeText: (v: string) => void;
  showPassword: boolean;
  setShowPassword: Dispatch<SetStateAction<boolean>>;
  focused: boolean;
  setFocused: (v: boolean) => void;
  submitting: boolean;
  onSubmit: () => void;
  placeholder?: string;
  autoComplete: "new-password" | "current-password";
}) {
  return (
    <View className="gap-1.5">
      <Text weight="medium" className="text-sm text-ink-soft">
        Password
      </Text>
      <View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#B3A78D"
          secureTextEntry={!showPassword}
          autoComplete={autoComplete}
          editable={!submitting}
          onSubmitEditing={onSubmit}
          returnKeyType="done"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn(
            "h-[52px] rounded-xl border bg-paper-card pr-14 pl-3 text-base text-ink",
            focused ? "border-accent" : "border-line",
          )}
        />
        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          className="absolute right-3 top-0 h-[52px] justify-center"
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? "Hide password" : "Show password"}>
          <Ionicons
            name={showPassword ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={showPassword ? "#B3A78D" : "#1F5D3C"}
          />
        </Pressable>
      </View>
    </View>
  );
}