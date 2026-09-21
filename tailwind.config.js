/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        line: "#E9DFCD",
        "line-soft": "#F2EADC",
        paper: {
          DEFAULT: "#FBF6EE",
          card: "#FFFDF8",
          inv: "#16452F",
        },
        ink: {
          DEFAULT: "#2B2418",
          soft: "#7A6E5A",
          faint: "#B3A78D",
        },
        accent: {
          DEFAULT: "#1F5D3C",
          deep: "#16452F",
          mid: "#2F7C54",
          tint: "#E4EFE6",
          tint2: "#F0F6EF",
        },
        gold: {
          DEFAULT: "#B98A2F",
          tint: "#F7EDD9",
        },
        danger: {
          DEFAULT: "#AC4431",
          deep: "#8C3323",
          tint: "#FAE9E1",
        },
      },
      fontFamily: {
        // Karla is the body face; each weight is its own registered family so
        // weight resolution is explicit across platforms (see constants/theme).
        sans: ["Karla_400Regular"],
        "karla-medium": ["Karla_500Medium"],
        "karla-semibold": ["Karla_600SemiBold"],
        "karla-bold": ["Karla_700Bold"],
        // Fraunces is the editorial serif for headings and key numbers.
        display: ["Fraunces_600SemiBold"],
        "display-bold": ["Fraunces_700Bold"],
      },
      boxShadow: {
        soft: "0 6px 16px 0 rgba(74, 58, 31, 0.07)",
        float: "0 10px 24px 0 rgba(32, 24, 8, 0.14)",
      },
    },
  },
  plugins: [],
};