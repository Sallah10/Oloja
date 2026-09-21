import { useFonts, Karla_400Regular, Karla_500Medium, Karla_600SemiBold, Karla_700Bold } from "@expo-google-fonts/karla";
import { Fraunces_600SemiBold, Fraunces_700Bold } from "@expo-google-fonts/fraunces";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import "@/global.css";

import { FeedbackProvider } from "@/components/feedback";
import { SyncBanner } from "@/components/sync-banner";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { subscribeSyncComplete } from "@/lib/offline";
import { Colors, Fonts } from "@/constants/theme";

void SplashScreen.preventAutoHideAsync();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.accent,
    background: Colors.light.paper,
    card: Colors.light.paper,
    text: Colors.light.ink,
    border: Colors.light.line,
  },
  fonts: {
    regular: { fontFamily: Fonts.body, fontWeight: "400" as const },
    medium: { fontFamily: Fonts.bodyMedium, fontWeight: "500" as const },
    bold: { fontFamily: Fonts.bodySemibold, fontWeight: "600" as const },
    heavy: { fontFamily: Fonts.bodyBold, fontWeight: "700" as const },
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

function Root() {
  const [fontsLoaded, fontError] = useFonts({
    Karla_400Regular,
    Karla_500Medium,
    Karla_600SemiBold,
    Karla_700Bold,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="dark" />
      <SyncInvalidator />
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="invite" />
          <Stack.Screen name="product/[id]" />
          <Stack.Screen name="customer/[id]" />
        </Stack>
        <BannerSlot />
      </View>
    </ThemeProvider>
  );
}

// A plain JS error during render used to leave a silent blank screen; the
// docs-recommended error boundary on the root layout turns that into a
// readable screen so bugs can't hide. Plain inline styles on purpose: if
// NativeWind itself is the crashing layer, this screen still has to render.
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#FBF6EE", justifyContent: "center", padding: 24 }}>
      <Text style={{ color: "#8C3323", fontSize: 16, fontFamily: Fonts.bodySemibold }}>
        Oloja hit a snag
      </Text>
      <ScrollView style={{ marginTop: 12, flexGrow: 0 }}>
        <Text style={{ color: "#2B2418", fontSize: 13, fontFamily: Fonts.body }}>
          {error ? String(error.message ?? error) : "No error details"}
        </Text>
        {error?.stack ? (
          <Text style={{ color: "#7A6E5A", fontSize: 12, marginTop: 8, fontFamily: Fonts.body }}>
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
          backgroundColor: Colors.light.accent,
          borderRadius: 12,
        }}>
        <Text style={{ color: "#FFFFFF", fontFamily: Fonts.bodySemibold }}>Try again</Text>
      </Pressable>
    </View>
  );
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
        <FeedbackProvider>
          <Root />
        </FeedbackProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}