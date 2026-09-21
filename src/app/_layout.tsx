import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import "@/global.css";

import { SyncBanner } from "@/components/sync-banner";
import { Colors } from "@/constants/theme";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { subscribeSyncComplete } from "@/lib/offline";

// TEMP DIAGNOSTIC: remove once the blank-screen bug is confirmed fixed.
console.log("[boot] _layout.tsx module evaluated");

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.accent,
    background: Colors.light.background,
    card: Colors.light.background,
    text: Colors.light.text,
    border: Colors.light.line,
  },
};

// After a sync round finishes, the mirror has fresh server data: invalidate
// every query so the screens stop showing the offline snapshot. This listens
// to sync-complete ONLY (not the generic status stream) to avoid refetch loops.
function SyncInvalidator() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      subscribeSyncComplete(() => {
        void queryClient.invalidateQueries();
      }),
    [queryClient],
  );
  return null;
}

// SyncBanner is inside the auth tree, but AuthProvider is rendered one level
// up from it, so it needs its own tiny bridge component to read useAuth().
function BannerSlot() {
  const { isSignedIn } = useAuth();
  if (!isSignedIn) return null;
  return <SyncBanner />;
}

// A plain JS error during render used to leave a silent blank screen; the
// docs-recommended error boundary on the root layout turns that into a
// readable screen so bugs can't hide. Plain inline styles on purpose: if
// NativeWind itself is the crashing layer, this screen still has to render.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#120B0B", justifyContent: "center", padding: 24 }}>
      <Text style={{ color: "#FF7A7A", fontSize: 16, fontWeight: "700" }}>Oloja failed to render</Text>
      <ScrollView style={{ marginTop: 12, flexGrow: 0 }}>
        <Text style={{ color: "#FFF", fontSize: 13, fontFamily: "monospace" }}>
          {error ? String(error.message ?? error) : "No error details"}
        </Text>
        {error?.stack ? (
          <Text style={{ color: "#CCCCCC", fontSize: 12, marginTop: 8, fontFamily: "monospace" }}>
            {error.stack}
          </Text>
        ) : null}
      </ScrollView>
      <Pressable
        onPress={() => void retry()}
        style={{
          marginTop: 16,
          alignSelf: "center",
          paddingHorizontal: 24,
          paddingVertical: 12,
          backgroundColor: "#AEB7B0",
          borderRadius: 8,
        }}>
        <Text style={{ color: "#120B0B", fontWeight: "700" }}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  // TEMP DIAGNOSTIC: remove once the blank-screen bug is confirmed fixed.
  console.log("[boot] RootLayout first render");
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider value={navigationTheme}>
          <StatusBar style="dark" />
          <SyncInvalidator />
          <View style={{ flex: 1 }}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="login" />
              <Stack.Screen name="settings" />
            </Stack>
            <BannerSlot />
          </View>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}