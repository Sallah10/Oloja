import { TextProps } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "@/components/ui/text";

type HeadingLevel = "h1" | "h2" | "h3";

type HeadingProps = TextProps & {
  level?: HeadingLevel;
  className?: string;
  children: React.ReactNode;
};

const base = "font-display tracking-tight text-ink";

const levels: Record<HeadingLevel, string> = {
  h1: "text-[34px] leading-[1.05]",
  h2: "text-[26px] leading-[1.1]",
  h3: "text-[20px] leading-[1.15]",
};

/** Editorial serif headline. Defaults to the Flock heading size. */
export function Heading({ level = "h3", className, children, ...props }: HeadingProps) {
  return (
    <Text {...props} display weight="semibold" className={cn(base, levels[level], className)}>
      {children}
    </Text>
  );
}