/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        line: "#E4DCCE",
        paper: {
          DEFAULT: "#FAF7F2",
          card: "#FFFFFF",
          line: "#E4DCCE",
        },
        ink: {
          DEFAULT: "#24211A",
          soft: "#6E685C",
          faint: "#A49D8E",
        },
        accent: {
          DEFAULT: "#1E5A3B",
          deep: "#16452C",
          mid: "#2E7D54",
          tint: "#E7EFE9",
        },
        danger: {
          DEFAULT: "#A63A2E",
          tint: "#F7ECE9",
        },
      },
    },
  },
  plugins: [],
};
