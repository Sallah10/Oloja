import { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "@/lib/cn";

import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

type ScreenHeaderProps = {
  /** Small uppercase lead-in, e.g. the shop or section name. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Rendered on the right (a back link, an action, a chip). */
  right?: ReactNode;
  className?: string;
};

/** The standard page header: eyebrow, serif title, optional subtitle + slot. */
export function ScreenHeader({ eyebrow, title, subtitle, right, className }: ScreenHeaderProps) {
  return (
    <View className={cn("mt-2 flex-row items-start justify-between gap-3", className)}>
      <View className="min-w-0 flex-1">
        {eyebrow ? (
          <Text weight="semibold" className="text-[11px] uppercase tracking-[1.6px] text-ink-faint">
            {eyebrow}
          </Text>
        ) : null}
        <Heading level="h1" className={cn("mt-1.5", right ? "text-[28px]" : undefined)}>
          {title}
        </Heading>
        {subtitle ? (
          <Text className="mt-1.5 text-sm leading-5 text-ink-soft">{subtitle}</Text>
        ) : null}
      </View>
      {right ? <View className="shrink-0">{right}</View> : null}
    </View>
  );
}