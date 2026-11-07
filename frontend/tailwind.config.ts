import type { Config } from "tailwindcss";
import { C } from "./src/lib/theme";

/**
 * "Open Water" — see ../brand.md.
 * Sky-white surfaces, deep-sea navy ink, ocean blue for action, coral only for danger.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular"],
      },
      colors: {
        bg: C.bg,
        panel: C.panel,
        raised: C.raised,
        rule: { DEFAULT: C.rule, 2: C.rule2 },
        fg: { DEFAULT: C.fg, 2: C.fg2, 3: C.fg3, 4: C.fg4 },
        ocean: { DEFAULT: C.ocean, deep: C.deep, aqua: C.aqua, mist: C.mist },
        signal: { DEFAULT: C.signal, soft: C.signalSoft },
        ok: C.ok,
        warn: C.warn,
      },
      borderRadius: { sm: "4px", DEFAULT: "6px", md: "10px", lg: "14px", xl: "20px", "2xl": "28px" },
      boxShadow: {
        float: "0 1px 1px rgba(6,34,61,.04), 0 8px 24px -8px rgba(6,34,61,.12), 0 24px 48px -24px rgba(11,132,243,.18)",
        lift: "0 2px 2px rgba(6,34,61,.05), 0 18px 40px -12px rgba(6,34,61,.22)",
      },
      transitionTimingFunction: { out: "cubic-bezier(.2,.8,.2,1)" },
      keyframes: {
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".3" } },
        swell: { "0%,100%": { transform: "translateX(0)" }, "50%": { transform: "translateX(-25%)" } },
        bob: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
      },
      animation: {
        blink: "blink 1.6s ease-in-out infinite",
        swell: "swell 14s ease-in-out infinite",
        "swell-slow": "swell 22s ease-in-out infinite",
        bob: "bob 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
