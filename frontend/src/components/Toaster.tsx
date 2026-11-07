"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, Info, ExternalLink, X } from "lucide-react";
import { txUrl } from "@/config";
import { short } from "@/lib/format";
import type { LogLine } from "@/hooks/useTx";

export interface ToastItem extends LogLine {
  id: string;
}

export function Toaster({ lines }: { lines: LogLine[] }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const seen = useRef<LogLine | undefined>(undefined);

  // When a new log line appears, add it as a toast. Each toast owns its own timer, so a burst of lines
  // (approve → deposit → borrow) doesn't cancel the earlier toasts' auto-dismiss.
  useEffect(() => {
    const latest = lines[0];
    if (!latest || latest === seen.current) return;
    seen.current = latest;
    const id = `${latest.t}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [{ ...latest, id }, ...prev].slice(0, 4));
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, latest.level === "err" ? 9000 : 6000));
  }, [lines]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const ICONS = {
    ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />,
    warn: <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />,
    err: <XCircle className="h-4 w-4 shrink-0 text-signal" />,
    info: <Info className="h-4 w-4 shrink-0 text-fg-3" />,
  };

  const BORDERS = {
    ok: "border-ok/40 bg-panel/95 shadow-[0_8px_24px_rgba(14,148,103,0.14)]",
    warn: "border-warn/40 bg-panel/95 shadow-[0_8px_24px_rgba(194,116,0,0.14)]",
    err: "border-signal/50 bg-panel/95 shadow-[0_8px_24px_rgba(232,71,59,0.16)]",
    info: "border-rule bg-panel/95 shadow-float",
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      <AnimatePresence>
        {toasts.map((toast) => {
          const url = toast.tx ? txUrl(toast.tx) : undefined;
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
              className={`pointer-events-auto rounded-lg border p-4 backdrop-blur-md ${BORDERS[toast.level]}`}
            >
              <div className="flex items-start gap-3">
                {ICONS[toast.level]}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg leading-snug">{toast.msg}</p>
                  {toast.tx && (
                    <div className="mt-1.5 flex items-center gap-2">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-xs text-ocean underline underline-offset-2 hover:text-ocean-deep"
                        >
                          View on Etherscan ({short(toast.tx, 4)})
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="font-mono text-xs text-fg-4">
                          Local Tx: {short(toast.tx, 6)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="focus-ring -m-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-fg-4 transition-colors hover:text-fg"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
