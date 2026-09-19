import { PropsWithChildren } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cn } from "@/lib/cn";

type ScreenProps = PropsWithChildren<{
  className?: string;
  scroll?: boolean;
}>;

export function Screen({ children, className, scroll = false }: ScreenProps) {
  if (scroll) {
    return (
      <SafeAreaView edges={["top"]} className={cn("flex-1 bg-paper", className)}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className={cn("flex-1 bg-paper px-4 pb-8", className)}>
      {children}
    </SafeAreaView>
  );
}