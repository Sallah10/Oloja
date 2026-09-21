import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "@/components/ui/text";

type StatTone = "default" | "accent" | "danger" | "gold";

type StatCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: ReactNode;
  caption: ReactNode;
  tone?: StatTone;
  onPress?: () => void;
  className?: string;
};

const iconTiles: Record<StatTone, string> = {
  default: "bg-paper-card border border-line",
  accent: "bg-accent-tint",
  danger: "bg-danger-tint",
  gold: "bg-gold-tint",
};

const iconColors: Record<StatTone, string> = {
  default: "#1F5D3C",
  accent: "#16452F",
  danger: "#AC4431",
  gold: "#B98A2F",
};

/** A small insight tile: icon, label, headline number, one-line story. */
export function StatCard({ icon, label, value, caption, tone = "default", onPress, className }: StatCardProps) {
  const body = (
    <View className={cn("rounded-2xl border border-line bg-paper-card p-4 shadow-soft", className)}>
      <View className={cn("mb-3 h-9 w-9 items-center justify-center rounded-xl", iconTiles[tone])}>
        <Ionicons name={icon} size={18} color={iconColors[tone]} />
      </View>
      <Text className="text-[11px] uppercase tracking-[1.2px] text-ink-faint">{label}</Text>
      <View className="mt-1">{value}</View>
      <Text className="mt-1 text-xs leading-4 text-ink-soft">{caption}</Text>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      {body}
    </Pressable>
  );
}