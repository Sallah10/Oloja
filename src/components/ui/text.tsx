import { StyleProp, Text as RNText, TextProps, TextStyle } from "react-native";

import { cn } from "@/lib/cn";

import { Fonts } from "@/constants/theme";

export type TextWeight = "normal" | "medium" | "semibold" | "bold";

type TextProps2 = Omit<TextProps, "style"> & {
  /** Karla weight. Defaults to regular. */
  weight?: TextWeight;
  /** Render in the Fraunces serif (display) face. */
  display?: boolean;
  className?: string;
  style?: StyleProp<TextStyle>;
};

const BODY_FAMILY: Record<TextWeight, string> = {
  normal: Fonts.body,
  medium: Fonts.bodyMedium,
  semibold: Fonts.bodySemibold,
  bold: Fonts.bodyBold,
};

const DISPLAY_FAMILY: Record<TextWeight, string> = {
  normal: Fonts.display,
  medium: Fonts.display,
  semibold: Fonts.display,
  bold: Fonts.displayBold,
};

/**
 * A Text that always carries a registered face. NativeWind's className and any
 * style prop are both applied, with explicit styles winning on conflict (like
 * on the web). Prefer the `weight` and `display` props over font-* classes.
 */
export function Text({ display, weight = "normal", className, style, ...props }: TextProps2) {
  const family = (display ? DISPLAY_FAMILY : BODY_FAMILY)[weight];
  const resolvedStyle: StyleProp<TextStyle> = style
    ? [{ fontFamily: family }, ...(Array.isArray(style) ? style : [style])]
    : { fontFamily: family };

  return <RNText {...props} className={cn(className)} style={resolvedStyle} />;
}