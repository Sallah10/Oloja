import { Redirect } from "expo-router";

import AppTabs from "@/components/app-tabs";
import { useAuth } from "@/context/auth-context";

export default function TabsLayout() {
  const { isSignedIn } = useAuth();

  if (!isSignedIn) return <Redirect href="/login" />;

  return <AppTabs />;
}