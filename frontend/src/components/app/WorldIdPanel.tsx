"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { proofOfHuman, useIDKitRequest, type IDKitResult, type RpContext } from "@worldcoin/idkit";
import { Check, Copy, ExternalLink, Loader2, Smartphone, X } from "lucide-react";
import { C } from "@/lib/theme";

type Env = "production" | "staging" | "sandbox";

/**
 * Our own World ID request UI, built on IDKit's headless hook.
 *
 * Why not the stock widget: it switches to its "Open World ID App" mobile layout on any window ≤ 1024 px,
 * which on a laptop deep-links to world.org instead of a verification screen. Here every size gets the path
 * that actually works for the environment — the World ID Simulator pre-loaded with this request on staging,
 * a QR code plus a World App link on production.
 */
export function WorldIdPanel({ rp, appId, action, environment, signal, onProof, onCancel, onFail }: {
  rp: RpContext; appId: `app_${string}`; action: string; environment: Env; signal: string;
  onProof: (r: IDKitResult) => Promise<void>; onCancel: () => void; onFail: (code: string) => void;
}) {
  const flow = useIDKitRequest({ app_id: appId, action, rp_context: rp, allow_legacy_proofs: true, environment, preset: proofOfHuman({ signal }) });
  const [qr, setQr] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<"waiting" | "verifying" | "done">("waiting");
  const handled = useRef(false);
  const staging = environment !== "production";

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { flow.open(); return () => flow.reset(); }, []);
  useEffect(() => {
    if (!flow.connectorURI) return;
    QRCode.toDataURL(flow.connectorURI, { margin: 1, width: 360, color: { dark: C.fg, light: "#FFFFFF" } }).then(setQr).catch(() => setQr(undefined));
  }, [flow.connectorURI]);
  useEffect(() => {
    if (!flow.isSuccess || !flow.result || handled.current) return;
    handled.current = true; setPhase("verifying");
    onProof(flow.result).then(() => setPhase("done")).catch(() => { handled.current = false; setPhase("waiting"); onFail("verification_rejected"); });
  }, [flow.isSuccess, flow.result, onProof, onFail]);
  useEffect(() => { if (flow.isError) onFail(String(flow.errorCode ?? "unknown")); }, [flow.isError, flow.errorCode, onFail]);

  const simUrl = flow.connectorURI ? `https://simulator.worldcoin.org?connect_url=${encodeURIComponent(flow.connectorURI)}` : undefined;
  const status = phase === "verifying" ? "Proof received — verifying with World and binding it on-chain…"
    : phase === "done" ? "Verified."
    : flow.isAwaitingUserConfirmation ? "Request opened — approve it in the " + (staging ? "simulator" : "World App") + "."
    : flow.connectorURI ? "Waiting for you to open the request." : "Preparing a signed request…";
  const copy = async () => { if (!flow.connectorURI) return; await navigator.clipboard.writeText(flow.connectorURI); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-stretch" role="group" aria-label="World ID verification">
      <div className="grid h-[180px] w-[180px] shrink-0 place-items-center self-center overflow-hidden rounded-lg border border-rule bg-white">
        {qr ? <img src={qr} alt="World ID request QR code" className="h-full w-full" /> : <Loader2 className="h-5 w-5 animate-spin text-fg-4" aria-hidden />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="label">{staging ? "World ID · staging" : "World ID"}</div>
            <p className="mt-1 text-sm text-fg-2" aria-live="polite">
              {phase === "verifying" || (!flow.connectorURI && phase === "waiting") ? <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {phase === "done" ? <Check className="mr-1.5 inline h-3.5 w-3.5 text-ok" aria-hidden /> : null}
              {status}
            </p>
          </div>
          <button className="btn-quiet !min-h-[32px] shrink-0" onClick={onCancel} aria-label="Cancel World ID verification"><X className="h-4 w-4" aria-hidden /></button>
        </div>
        {staging ? (
          <>
            <a className={`btn-ocean w-fit ${simUrl ? "" : "pointer-events-none opacity-40"}`} href={simUrl} target="_blank" rel="noopener noreferrer">
              Open World ID Simulator <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <p className="text-xs leading-relaxed text-fg-3">
              Staging runs on World&apos;s official simulator — no phone or Orb needed. It opens with this request loaded:
              pick or create a test identity, then approve. This page updates by itself.
            </p>
          </>
        ) : (
          <>
            <a className={`btn-ocean w-fit ${flow.connectorURI ? "" : "pointer-events-none opacity-40"}`} href={flow.connectorURI ?? undefined}>
              <Smartphone className="h-4 w-4" aria-hidden /> Open World App
            </a>
            <p className="text-xs leading-relaxed text-fg-3">On a computer, scan the code with World App. On your phone, tap the button.</p>
          </>
        )}
        <button className="btn-quiet w-fit !min-h-[28px] !px-0 text-xs" onClick={copy} disabled={!flow.connectorURI}>
          {copied ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} {copied ? "Copied" : "Copy request link"}
        </button>
      </div>
    </div>
  );
}
