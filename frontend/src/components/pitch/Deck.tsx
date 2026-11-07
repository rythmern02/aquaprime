"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Download, Maximize2, X } from "lucide-react";
import { SLIDES } from "./slides";

const W = 1600, H = 900;

/**
 * A 16:9 deck that scales to any screen. Keyboard: ← → Space PageUp/PageDown Home End, F for fullscreen.
 * Every slide is addressable (/pitch#5). Printing renders one slide per page for a clean PDF export.
 */
export function Deck() {
  const [i, setI] = useState(0);
  const [scale, setScale] = useState(0.5);
  const host = useRef<HTMLDivElement>(null);
  const n = SLIDES.length;
  const go = useCallback((k: number) => setI(Math.max(0, Math.min(n - 1, k))), [n]);

  useLayoutEffect(() => {
    const fit = () => {
      const el = host.current; if (!el) return;
      setScale(Math.min(el.clientWidth / W, el.clientHeight / H));
    };
    fit();
    const ro = new ResizeObserver(fit); if (host.current) ro.observe(host.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const fromHash = () => { const k = parseInt(location.hash.slice(1), 10); if (k >= 1 && k <= n) setI(k - 1); };
    fromHash(); window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [n]);
  useEffect(() => { history.replaceState(null, "", `#${i + 1}`); }, [i]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(i + 1); }
      else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); go(i - 1); }
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(n - 1);
      else if (e.key.toLowerCase() === "f") { void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [i, n, go]);

  return (
    <div className="deck fixed inset-0 flex flex-col bg-[#DCEBF7]">
      <style>{`
        .deck .slide { display: none; }
        .deck .slide.on { display: block; }
        .deck .slide.on .rise { animation: rise .7s cubic-bezier(.2,.8,.2,1) both; }
        @keyframes rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .deck .slide.on .rise { animation: none; } }
        @media print {
          @page { size: ${W}px ${H}px; margin: 0; }
          html, body { background: #fff !important; }
          .deck { position: static !important; display: block !important; background: #fff !important; }
          .deck .chrome { display: none !important; }
          .deck .viewport { display: block !important; padding: 0 !important; }
          .deck .stage { transform: none !important; box-shadow: none !important; border-radius: 0 !important; position: static !important; }
          .deck .slide { display: block !important; break-after: page; }
          .deck .slide .rise { animation: none !important; }
        }
      `}</style>

      <header className="chrome flex h-14 shrink-0 items-center justify-between px-5">
        <Link href="/" className="focus-ring flex items-center gap-2 rounded-full px-2 text-sm text-fg-2 hover:text-fg"><X className="h-4 w-4" aria-hidden /> Close</Link>
        <div className="num text-xs text-fg-3" aria-live="polite">{String(i + 1).padStart(2, "0")} / {String(n).padStart(2, "0")} · {SLIDES[i].title}</div>
        <div className="flex items-center gap-1">
          <button className="btn-quiet !min-h-[36px]" onClick={() => window.print()} title="Save as PDF"><Download className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">PDF</span></button>
          <button className="btn-quiet !min-h-[36px]" onClick={() => void document.documentElement.requestFullscreen()} title="Fullscreen (F)"><Maximize2 className="h-4 w-4" aria-hidden /><span className="sr-only">Fullscreen</span></button>
        </div>
      </header>

      <div ref={host} className="viewport relative flex min-h-0 flex-1 items-center justify-center px-4">
        <div className="stage absolute left-1/2 top-1/2 overflow-hidden rounded-2xl bg-white shadow-lift"
          style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
          {SLIDES.map((S, k) => (
            <section key={S.title} className={`slide relative h-[900px] w-[1600px] overflow-hidden ${k === i ? "on" : ""}`} aria-hidden={k !== i} aria-label={`Slide ${k + 1}: ${S.title}`}>
              <S.Body />
            </section>
          ))}
        </div>
      </div>

      <footer className="chrome flex h-16 shrink-0 items-center justify-center gap-4 px-5">
        <button className="btn-ghost !min-h-[40px] !px-3" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous slide"><ArrowLeft className="h-4 w-4" aria-hidden /></button>
        <ol className="flex items-center gap-1.5" aria-label="Slides">
          {SLIDES.map((S, k) => (
            <li key={S.title}>
              <button onClick={() => go(k)} aria-label={`Go to slide ${k + 1}: ${S.title}`} aria-current={k === i ? "step" : undefined}
                className={`focus-ring block h-2 rounded-full transition-all duration-300 ${k === i ? "w-8 bg-ocean" : "w-2 bg-fg/20 hover:bg-fg/40"}`} />
            </li>
          ))}
        </ol>
        <button className="btn-primary !min-h-[40px] !px-3" onClick={() => go(i + 1)} disabled={i === n - 1} aria-label="Next slide"><ArrowRight className="h-4 w-4" aria-hidden /></button>
      </footer>
    </div>
  );
}
