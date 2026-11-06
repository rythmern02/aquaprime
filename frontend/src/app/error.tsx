"use client";
import Link from "next/link";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-[100svh] place-items-center px-4">
      <div className="card max-w-md text-center">
        <div className="eyebrow mb-3">Something broke</div>
        <h1 className="h-display text-2xl">The interface hit an error.</h1>
        <p className="mt-3 text-sm text-ink-400">Your funds are unaffected — everything lives on-chain. {error.digest ? `Ref ${error.digest}.` : ""}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button className="btn-primary" onClick={reset}>Try again</button>
          <Link href="/" className="btn-ghost">Home</Link>
        </div>
      </div>
    </main>
  );
}
