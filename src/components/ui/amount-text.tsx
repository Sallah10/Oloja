import { Text, TextProps } from "react-native";

import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

type AmountTone = "default" | "owed" | "debt" | "soft";
type AmountSize = "xs" | "sm" | "base" | "lg" | "xl";

type AmountTextProps = TextProps & {
  amount: number;
  tone?: AmountTone;
  size?: AmountSize;
};

const tones: Record<AmountTone, string> = {
  default: "text-ink",
  owed: "text-accent",
  debt: "text-danger",
  soft: "text-ink-soft",
};

const sizes: Record<AmountSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-2xl",
  xl: "text-3xl",
};

export function AmountText({ amount, tone = "default", size = "base", className, ...props }: AmountTextProps) {
  return (
    <Text {...props} className={cn("font-medium tabular-nums tracking-tight", tones[tone], sizes[size], className)}>
      {formatMoney(amount)}
    </Text>
  );
}