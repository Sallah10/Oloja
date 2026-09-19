import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";

import "@/global.css";

import { SyncBanner } from "@/components/sync-banner";
import { Colors } from "@/constants/theme";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { subscribeSyncComplete } from "@/lib/offline";

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

export default function RootLayout() {
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
          <View className="flex-1">
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