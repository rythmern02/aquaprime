"use client";
import { motion } from "framer-motion";

export const ease = [0.2, 0.8, 0.2, 1] as const;
export const reveal = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease },
};

/** The brand mark: a square of collateral with the surgical slice taken out of one corner. */
export function Mark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <path d="M1.5 1.5h17v11l-6 6h-11z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 14h4.5L14 18.5z" fill="#1FC2E3" />
    </svg>
  );
}

/** Editorial section header: index + kicker in the left column, headline on the right. */
export function SectionHead({ index, kicker, title, children, id }: {
  index: string; kicker: string; title: React.ReactNode; children?: React.ReactNode; id?: string;
}) {
  return (
    <motion.header {...reveal} id={id} className="grid scroll-mt-24 gap-6 border-t border-rule pt-6 md:grid-cols-12">
      <div className="label md:col-span-3">
        <span className="text-fg">{index}</span> <span className="mx-1 text-fg-4">/</span> {kicker}
      </div>
      <div className="md:col-span-9">
        <h2 className="h-display max-w-3xl text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.02]">{title}</h2>
        {children && <div className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fg-3">{children}</div>}
      </div>
    </motion.header>
  );
}
