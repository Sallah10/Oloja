/**
 * Brand tokens for the app. Values mirror tailwind.config.js so that
 * programmatic colors (native tab bar) and className colors stay in sync.
 */

import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#24211A",
    background: "#FAF7F2",
    backgroundElement: "#F1ECE2",
    backgroundSelected: "#E7EFE9",
    textSecondary: "#6E685C",
    accent: "#1E5A3B",
    accentDeep: "#16452C",
    accentMid: "#2E7D54",
    accentTint: "#E7EFE9",
    line: "#E4DCCE",
    danger: "#A63A2E",
    inkSoft: "#6E685C",
    inkFaint: "#A49D8E",
    paper: "#FAF7F2",
    paperCard: "#FFFFFF",
  },
  dark: {
    text: "#E8E4DC",
    background: "#17140F",
    backgroundElement: "#221E17",
    backgroundSelected: "#2A342B",
    textSecondary: "#A8A293",
    accent: "#4C8F6B",
    accentDeep: "#3A7355",
    accentMid: "#5DA37F",
    accentTint: "#22302A",
    line: "#332E24",
    danger: "#C05548",
    inkSoft: "#A8A293",
    inkFaint: "#776F60",
    paper: "#17140F",
    paperCard: "#221E17",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

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
export const MaxContentWidth = 800;