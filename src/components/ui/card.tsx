import { Pressable, View, ViewProps } from "react-native";

import { cn } from "@/lib/cn";

import { Shadows } from "@/constants/theme";

type CardProps = ViewProps & {
  onPress?: () => void;
  /** Lighter treatment: no shadow, hairline border only. */
  flat?: boolean;
  className?: string;
};

/**
 * The standard surface: warm white, generous rounding, soft paper shadow.
 * Pressable optionally to make a tappable row.
 */
export function Card({ onPress, flat = false, className, style, ...props }: CardProps) {
  const base = cn(
    "rounded-2xl border border-line bg-paper-card",
    onPress && "active:opacity-80",
    className,
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className={base} style={[!flat && Shadows.soft, style]} {...props} />
    );
  }

  return <View className={base} style={[!flat && Shadows.soft, style]} {...props} />;
}

type CardSectionProps = ViewProps & { className?: string };

/** A titled block inside a Card, separated by a hairline. */
export function CardSection({ className, ...props }: CardSectionProps) {
  return <View className={cn("border-t border-line", className)} {...props} />;
}