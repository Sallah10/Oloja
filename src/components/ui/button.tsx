import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";

import { cn } from "@/lib/cn";

import { Text } from "@/components/ui/text";

import { Colors, Shadows } from "@/constants/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "sm";

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  /** Leading icon glyph name (Ionicons). */
  icon?: keyof typeof Ionicons.glyphMap;
  busy?: boolean;
  className?: string;
  /** Full width button (default). Set false for an inline/auto-size button. */
  block?: boolean;
};

const base =
  "items-center justify-center rounded-xl active:opacity-80 disabled:opacity-45 flex-row gap-2";

const sizes: Record<Size, string> = {
  sm: "h-10 px-3.5",
  md: "h-[52px] px-5",
  lg: "h-16 px-6",
};

const variants: Record<Variant, string> = {
  primary: "bg-accent",
  secondary: "bg-paper-card border border-line",
  danger: "bg-danger",
  ghost: "bg-transparent",
};

const textVariants: Record<Variant, string> = {
  primary: "text-white",
  secondary: "text-ink",
  danger: "text-white",
  ghost: "text-accent-deep",
};

const textSizes: Record<Size, string> = {
  sm: "text-[13px]",
  md: "text-[15px]",
  lg: "text-base",
};

const iconColor: Record<Variant, string> = {
  primary: "#FFFFFF",
  secondary: Colors.light.accentDeep,
  danger: "#FFFFFF",
  ghost: Colors.light.accentDeep,
};

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  icon,
  busy,
  className,
  block = true,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      style={variant === "primary" || variant === "danger" ? Shadows.soft : undefined}
      className={cn(base, sizes[size], variants[variant], block && "self-stretch", className)}>
      {icon ? <Ionicons name={icon} size={size === "sm" ? 16 : 20} color={iconColor[variant]} /> : null}
      <Text weight="semibold" className={cn(textSizes[size], textVariants[variant])}>
        {title}
      </Text>
    </Pressable>
  );
}