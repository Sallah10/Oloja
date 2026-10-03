/**
 * Brand tokens for Oloja. Values mirror tailwind.config.js so that
 * programmatic colors (native tab bar, shadows) and className colors stay
 * in sync. The app is light-only by design (see app.json "userInterfaceStyle").
 *
 * The identity is "a quiet ledger": warm paper, deep ink, a calm forest green
 * for money, and an editorial serif (Fraunces) for the moments that matter.
 */

import { Platform, StyleSheet } from "react-native";

export const Colors = {
  light: {
    // Paper
    paper: "#FBF6EE",
    paperCard: "#FFFDF8",
    paperInv: "#16452F",

    // Lines + hairlines
    line: "#E9DFCD",
    lineSoft: "#F2EADC",

    // Ink (text)
    ink: "#2B2418",
    inkSoft: "#7A6E5A",
    inkFaint: "#B3A78D",

    // Accent (money / positive) - deep forest green
    accent: "#1F5D3C",
    accentDeep: "#16452F",
    accentMid: "#2F7C54",
    accentTint: "#E4EFE6",
    accentTint2: "#F0F6EF",

    // Gold - warm highlight used sparingly for the "story" moments
    gold: "#B98A2F",
    goldTint: "#F7EDD9",

    // Danger / debts / stock warnings - warm rust, not alarm red
    danger: "#AC4431",
    dangerDeep: "#8C3323",
    dangerTint: "#FAE9E1",
  },
} as const;

/** Font families registered at boot via expo-font (see src/app/_layout.tsx). */
export const Fonts = {
  body: "Karla_400Regular",
  bodyMedium: "Karla_500Medium",
  bodySemibold: "Karla_600SemiBold",
  bodyBold: "Karla_700Bold",
  display: "Fraunces_600SemiBold",
  displayBold: "Fraunces_700Bold",
} as const;

export const Radius = {
  control: 12,
  card: 20,
  cardInner: 14,
  pill: 999,
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 760;

/** Warm, soft shadow used on floating elements (cards, sheets, toasts). */
export const Shadows = StyleSheet.create({
  soft: {
    shadowColor: "#4A3A1F",
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    shadowOpacity: 0.07,
    elevation: 3,
  },
  float: {
    shadowColor: "#201808",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    shadowOpacity: 0.14,
    elevation: 8,
  },
});

/** Dark hero card shadow (darker for contrast on colored surfaces). */
export const HeroShadow = StyleSheet.create({
  soft: {
    shadowColor: "#0C2B1C",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    shadowOpacity: 0.22,
    elevation: 6,
  },
});