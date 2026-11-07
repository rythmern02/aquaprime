"use client";
import { useEffect, useRef } from "react";
import { C } from "@/lib/theme";

/**
 * A Higgs-style field: an even lattice that's massless until something moves through it. Near the cursor
 * (or the drifting "trade" when the cursor is away) points are drawn in, gain mass, glow and bond.
 * Clicking sends a pulse through the field. Canvas 2D, paused off-screen, static under reduced motion.
 */
type P = { hx: number; hy: number; x: number; y: number; vx: number; vy: number; m: number };

export function HiggsField({ className = "", spacing = 26, onMass }: { className?: string; spacing?: number; onMass?: (m: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, cols = 0, rows = 0, pts: P[] = [], raf = 0, visible = true, t0 = performance.now();
    const cur = { x: -1e4, y: -1e4, inside: false };
    const pulses: { x: number; y: number; t: number }[] = [];
    const build = () => {
      const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / spacing) + 1; rows = Math.ceil(H / spacing) + 1; pts = [];
      const ox = (W - (cols - 1) * spacing) / 2, oy = (H - (rows - 1) * spacing) / 2;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const hx = ox + i * spacing, hy = oy + j * spacing; pts.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0, m: 0 });
      }
    };
    const rgb = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
    const [a0, a1, b0] = [rgb(C.fg4), rgb(C.ocean), rgb(C.aqua)];
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      // when the cursor is away, a "trade" drifts through the field on its own
      const sx = cur.inside ? cur.x : W * (.5 + .34 * Math.sin(t * .37));
      const sy = cur.inside ? cur.y : H * (.5 + .3 * Math.sin(t * .53 + 1.3));
      const R = Math.max(210, Math.min(W, H) * .5);
      let total = 0;
      for (const p of pts) {
        const dx = sx - p.x, dy = sy - p.y, d = Math.hypot(dx, dy) || 1;
        const near = Math.max(0, 1 - d / R), target = near * near;
        p.m += (target - p.m) * .12;
        const pull = near * near * 1.3;
        p.vx += (dx / d) * pull + (p.hx - p.x) * .045; p.vy += (dy / d) * pull + (p.hy - p.y) * .045;
        for (const q of pulses) {
          const age = t - q.t, ring = age * 520, pd = Math.hypot(p.x - q.x, p.y - q.y);
          const band = Math.exp(-((pd - ring) ** 2) / 900) * Math.max(0, 1 - age / 1.4);
          if (band > .01) { p.vx += ((p.x - q.x) / (pd || 1)) * band * 6; p.vy += ((p.y - q.y) / (pd || 1)) * band * 6; p.m = Math.min(1, p.m + band * .5); }
        }
        p.vx *= .82; p.vy *= .82; p.x += p.vx; p.y += p.vy; total += p.m;
      }
      while (pulses.length && t - pulses[0].t > 1.4) pulses.shift();
      onMass?.(total / pts.length);
      ctx.clearRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      glow.addColorStop(0, `rgba(${b0.join(",")},.20)`); glow.addColorStop(1, `rgba(${b0.join(",")},0)`);
      ctx.fillStyle = glow; ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
      // bonds between massive neighbours
      ctx.lineWidth = 1.2;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const p = pts[j * cols + i]; if (p.m < .1) continue;
        for (const q of [i + 1 < cols ? pts[j * cols + i + 1] : null, j + 1 < rows ? pts[(j + 1) * cols + i] : null]) {
          if (!q || q.m < .1) continue;
          ctx.strokeStyle = `rgba(${a1.join(",")},${Math.min(p.m, q.m) * .8})`;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
      for (const p of pts) {
        const m = p.m, c = m > .55 ? b0.map((v, k) => v + (a1[k] - v) * (1 - (m - .55) / .45)) : a0.map((v, k) => v + (a1[k] - v) * (m / .55));
        ctx.fillStyle = `rgba(${c.map(Math.round).join(",")},${.45 + m * .55})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.2 + m * 4.6, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduce && visible) raf = requestAnimationFrame(frame);
    };
    const move = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); cur.x = e.clientX - r.left; cur.y = e.clientY - r.top; cur.inside = cur.x >= 0 && cur.y >= 0 && cur.x <= W && cur.y <= H; };
    const leave = () => { cur.inside = false; };
    const down = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); pulses.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: (performance.now() - t0) / 1000 }); };
    const io = new IntersectionObserver(([en]) => { const was = visible; visible = en.isIntersecting; if (visible && !was && !reduce) raf = requestAnimationFrame(frame); }, { rootMargin: "100px" });
    build(); io.observe(cv); raf = requestAnimationFrame(frame);
    const host = cv.parentElement!;
    host.addEventListener("pointermove", move); host.addEventListener("pointerleave", leave); host.addEventListener("pointerdown", down);
    const ro = new ResizeObserver(build); ro.observe(cv);
    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); host.removeEventListener("pointermove", move); host.removeEventListener("pointerleave", leave); host.removeEventListener("pointerdown", down); };
  }, [spacing, onMass]);
  return <canvas ref={ref} className={`block h-full w-full ${className}`} aria-hidden />;
}
