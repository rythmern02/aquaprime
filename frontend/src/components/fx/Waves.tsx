/**
 * Layered SVG swell. Used as section dividers and as the no-WebGL ocean. Pure CSS animation,
 * frozen under prefers-reduced-motion by the global rule.
 */
const PATH = "M0 40 C 150 10 300 70 450 40 S 750 10 900 40 S 1200 70 1350 40 S 1650 10 1800 40 V 120 H 0 Z";

export function Waves({ tone = "light", className = "", flip = false }: { tone?: "light" | "deep" | "sky"; className?: string; flip?: boolean }) {
  const layers = tone === "deep"
    ? [["#7CCBF0", .9, "animate-swell-slow"], ["#2FA8DD", .9, "animate-swell"], ["#0B7FE8", .95, "animate-swell-slow"], ["#0A4A85", 1, "animate-swell"]]
    : tone === "sky"
      ? [["#FFFFFF", .5, "animate-swell-slow"], ["#FFFFFF", .8, "animate-swell"]]
      : [["#CFEAFB", .7, "animate-swell-slow"], ["#E3F2FD", .9, "animate-swell"], ["#F4F9FE", 1, "animate-swell-slow"]];
  return (
    <div className={`pointer-events-none relative overflow-hidden ${flip ? "rotate-180" : ""} ${className}`} aria-hidden>
      {layers.map(([fill, op, anim], i) => (
        <svg key={i} viewBox="0 0 1800 120" preserveAspectRatio="none"
          className={`absolute bottom-0 left-0 h-full w-[200%] ${anim as string}`}
          style={{ transform: `translateY(${(layers.length - 1 - i) * -10}%)`, animationDelay: `${i * -3}s` }}>
          <path d={PATH} fill={fill as string} fillOpacity={op as number} />
        </svg>
      ))}
    </div>
  );
}
