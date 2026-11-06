import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular"],
      },
      colors: {
        abyss: "#03050A",
        deep: "#070B14",
        trench: "#0C1322",
        line: "#1A2438",
        tide: { DEFAULT: "#5CF2E6", 300: "#9DF8F0", 400: "#5CF2E6", 500: "#22D8CB", 600: "#12A79D" },
        pulse: { DEFAULT: "#8B5CFF", 300: "#B79CFF", 400: "#8B5CFF", 500: "#6E3BFF" },
        bloom: { DEFAULT: "#C8FF5A", 400: "#C8FF5A", 500: "#A6E62E" },
        ember: { DEFAULT: "#FF4D6D", 400: "#FF4D6D", 500: "#E8294D" },
        amber: { DEFAULT: "#FFB547", 400: "#FFB547" },
        ink: { 50: "#E8EEF8", 300: "#B6C2D6", 400: "#93A1B8", 500: "#6B7890", 600: "#4A5568" },
        // legacy aliases used by older components
        aqua: { 300: "#9DF8F0", 400: "#5CF2E6", 500: "#22D8CB", 600: "#12A79D" },
        prime: { 400: "#B79CFF", 500: "#8B5CFF" },
      },
      boxShadow: {
        glow: "0 0 60px -12px rgba(92,242,230,.55)",
        "glow-pulse": "0 0 60px -12px rgba(139,92,255,.6)",
        "glow-ember": "0 0 50px -12px rgba(255,77,109,.6)",
      },
      transitionTimingFunction: { liquid: "cubic-bezier(.22,1,.36,1)" },
      keyframes: {
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
      },
      animation: {
        marquee: "marquee 40s linear infinite",
        shimmer: "shimmer 2.2s linear infinite",
        floaty: "floaty 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
