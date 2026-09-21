import { cn } from "@/lib/cn";

import { Text } from "@/components/ui/text";

import { formatMoney } from "@/lib/money";

type AmountTone = "default" | "owed" | "debt" | "soft" | "hero" | "danger";
type AmountSize = "xs" | "sm" | "base" | "lg" | "xl" | "2xl";

type AmountTextProps = {
  amount: number;
  tone?: AmountTone;
  size?: AmountSize;
  weight?: "normal" | "medium" | "semibold" | "bold";
  className?: string;
};

const tones: Record<AmountTone, string> = {
  default: "text-ink",
  owed: "text-accent-deep",
  debt: "text-danger",
  soft: "text-ink-soft",
  hero: "text-white",
  danger: "text-danger-deep",
};

const sizes: Record<AmountSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-2xl",
  xl: "text-3xl",
  "2xl": "text-[38px]",
};

/** A formatted naira figure. `tabular-nums` keeps digits aligned so a column
 *  of amounts reads like a real ledger page. */
export function AmountText({
  amount,
  tone = "default",
  size = "base",
  weight = "semibold",
  className,
}: AmountTextProps) {
  return (
    <Text
      weight={weight}
      className={cn("tabular-nums tracking-tight", tones[tone], sizes[size], className)}
      style={{ fontVariant: ["tabular-nums"] }}>
      {formatMoney(amount)}
    </Text>
  );
}