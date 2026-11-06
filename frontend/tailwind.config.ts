import type { Config } from "tailwindcss";

/**
 * "Graphite / Signal" — see ../brand.md.
 * Warm near-black surfaces, bone text, one signal colour that means "look here".
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
        bg: "#0B0B0A",
        panel: "#111110",
        raised: "#191917",
        rule: { DEFAULT: "#24231F", 2: "#34332E" },
        fg: { DEFAULT: "#EDEBE5", 2: "#BDB9B0", 3: "#8C887F", 4: "#66635C" },
        signal: { DEFAULT: "#FF5B24", soft: "#FF8A5F" },
        ok: "#55C48C",
        warn: "#E3A63C",
      },
      borderRadius: { sm: "2px", DEFAULT: "4px", md: "6px", lg: "8px", xl: "10px" },
      transitionTimingFunction: { out: "cubic-bezier(.2,.8,.2,1)" },
      keyframes: {
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".25" } },
      },
      animation: { blink: "blink 1.6s steps(2,start) infinite" },
    },
  },
  plugins: [],
} satisfies Config;
