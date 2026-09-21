/**
 * Brand tokens for the app. Values mirror tailwind.config.js so that
 * programmatic colors (native tab bar) and className colors stay in sync.
 * The app is light-only by design (see app.json "userInterfaceStyle").
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
export const MaxContentWidth = 800;