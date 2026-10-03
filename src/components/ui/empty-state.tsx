import { Ionicons } from "@expo/vector-icons";
import { PropsWithChildren } from "react";
import { View } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "@/components/ui/text";

type EmptyStateProps = PropsWithChildren<{
  title: string;
  body: string;
  /** An optional third line that nudges the owner toward the next step. */
  tip?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  className?: string;
}>;

/** A friendly, story-forward empty state with a single clear next action. */
export function EmptyState({ title, body, tip, icon, children, className }: EmptyStateProps) {
  return (
    <View className={cn("items-center px-6 py-10 text-center", className)}>
      {icon ? (
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl border border-line bg-paper-card">
          <Ionicons name={icon} size={28} color="#1F5D3C" />
        </View>
      ) : null}
      <Text display weight="semibold" className="text-center text-lg leading-6 text-ink">
        {title}
      </Text>
      <Text className="mt-2 max-w-sm text-center text-sm leading-5 text-ink-soft">{body}</Text>
      {tip ? (
        <Text className="mt-3 max-w-sm text-center text-xs leading-4 text-ink-faint">{tip}</Text>
      ) : null}
      {children ? <View className="mt-6 w-full max-w-xs">{children}</View> : null}
    </View>
  );
}