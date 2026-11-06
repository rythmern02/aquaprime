import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular"],
      },
      colors: {
        ink: { 950: "#05080d", 900: "#0a0f17", 850: "#0f1621", 800: "#141d2b", 700: "#1e2a3d", 600: "#2b3a52" },
        aqua: { 300: "#7ee8f5", 400: "#3fd6ea", 500: "#16bdd4", 600: "#0e95a8" },
        prime: { 400: "#c9a7ff", 500: "#a77bff" },
      },
      boxShadow: { glow: "0 0 40px -10px rgba(63,214,234,.55)" },
    },
  },
  plugins: [],
} satisfies Config;
