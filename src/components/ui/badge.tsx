import { View } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "@/components/ui/text";

type BadgeTone = "neutral" | "accent" | "danger" | "gold" | "ink";

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
};

const tones: Record<BadgeTone, string> = {
  neutral: "bg-paper-card border border-line",
  accent: "bg-accent-tint",
  danger: "bg-danger-tint",
  gold: "bg-gold-tint",
  ink: "bg-ink",
};

const textTones: Record<BadgeTone, string> = {
  neutral: "text-ink-soft",
  accent: "text-accent-deep",
  danger: "text-danger-deep",
  gold: "text-gold",
  ink: "text-paper",
};

const dotColors: Record<BadgeTone, string> = {
  neutral: "bg-ink-faint",
  accent: "bg-accent",
  danger: "bg-danger",
  gold: "bg-gold",
  ink: "bg-paper",
};

export function Badge({ label, tone = "neutral", dot = false, className }: BadgeProps) {
  return (
    <View className={cn("flex-row items-center gap-1.5 rounded-full px-2.5 py-1", tones[tone], className)}>
      {dot ? <View className={cn("h-1.5 w-1.5 rounded-full", dotColors[tone])} /> : null}
      <Text className={cn("text-xs font-medium", textTones[tone])}>{label}</Text>
    </View>
  );
}