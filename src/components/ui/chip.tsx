import { Pressable, View } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "@/components/ui/text";

/**
 * A selectable pill used throughout flows (pick a product, customer, mode).
 * Disabled chips render muted so an owner can see what's out of stock at a glance.
 */
export function Chip({
  label,
  subtitle,
  selected = false,
  onPress,
  disabled = false,
  trailing,
  className,
}: {
  label: string;
  subtitle?: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const body = (
    <View
      className={cn(
        "rounded-xl border px-3 py-2.5",
        disabled && "opacity-45",
        selected ? "border-accent bg-accent-tint" : "border-line bg-paper-card",
        className,
      )}>
      <Text
        weight={selected ? "semibold" : "normal"}
        className={cn("text-sm leading-5", selected ? "text-accent-deep" : "text-ink")}>
        {label}
      </Text>
      {subtitle ? (
        <Text className={cn("mt-0.5 text-xs", selected ? "text-accent-deep/70" : "text-ink-soft")}>
          {subtitle}
        </Text>
      ) : null}
      {trailing ? <View className="mt-1">{trailing}</View> : null}
    </View>
  );

  if (!onPress || disabled) return body;

  return (
    <Pressable onPress={onPress} className="active:opacity-75">
      {body}
    </Pressable>
  );
}