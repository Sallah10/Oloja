import { PropsWithChildren } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cn } from "@/lib/cn";

import { MaxContentWidth } from "@/constants/theme";

type ScreenProps = PropsWithChildren<{
  className?: string;
  scroll?: boolean;
}>;

/**
 * The page frame: warm paper ground, safe top inset, a centered column that
 * caps its width on wide (web) screens so content never stretches.
 */
export function Screen({ children, className, scroll = false }: ScreenProps) {
  if (scroll) {
    return (
      <SafeAreaView edges={["top"]} className={cn("flex-1 bg-paper", className)}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}>
          <View
            className="mx-auto w-full flex-1 px-4 pb-10"
            style={{ maxWidth: MaxContentWidth }}>
            {children}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className={cn("flex-1 bg-paper", className)}>
      <View className="mx-auto w-full flex-1 px-4" style={{ maxWidth: MaxContentWidth }}>
        {children}
      </View>
    </SafeAreaView>
  );
}