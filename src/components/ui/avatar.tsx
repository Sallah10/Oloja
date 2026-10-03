import { View } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "@/components/ui/text";

/** A warm initials avatar - the shop-owner's human touch where photos are rare. */
export function Avatar({ name, size = 44, className }: { name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const fontSize = Math.round(size * 0.36);

  return (
    <View
      className={cn("items-center justify-center rounded-full bg-accent-tint", className)}
      style={{ width: size, height: size }}>
      <Text
        display
        weight="semibold"
        className="text-accent-deep"
        style={{ fontSize, lineHeight: fontSize * 1.2 }}>
        {initials || "?"}
      </Text>
    </View>
  );
}