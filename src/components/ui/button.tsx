import { Pressable, Text } from "react-native";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  className?: string;
};

const base = "h-12 items-center justify-center rounded-md px-5 active:opacity-80 disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary: "bg-accent",
  secondary: "bg-paper-card border border-line",
  danger: "bg-danger",
  ghost: "bg-transparent",
};

const textStyles: Record<Variant, string> = {
  primary: "text-white font-semibold",
  secondary: "text-ink font-medium",
  danger: "text-white font-semibold",
  ghost: "text-accent font-semibold",
};

export function Button({ title, onPress, variant = "primary", disabled, className }: ButtonProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled} className={cn(base, variants[variant], className)}>
      <Text className={cn("text-base", textStyles[variant])}>{title}</Text>
    </Pressable>
  );
}