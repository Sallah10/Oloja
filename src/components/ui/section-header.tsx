import { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "@/components/ui/text";

type SectionHeaderProps = {
  title: string;
  /** Optional action, e.g. "See all". */
  action?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <View className={cn("flex-row items-center justify-between", className)}>
      <Text weight="semibold" className="text-[11px] uppercase tracking-[1.6px] text-ink-faint">
        {title}
      </Text>
      {action}
    </View>
  );
}