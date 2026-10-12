"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";

export const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({ children, delay = 0, y = 24, className = "", ...rest }: { children: ReactNode; delay?: number; y?: number; className?: string } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0, y, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.9, delay, ease: EASE }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Headline that rises in word by word. */
export function SplitHeadline({ text, className = "", delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    // The observer sits on the visible wrapper: words translated inside an
    // overflow-hidden mask would otherwise never count as "in view".
    <motion.span className={className} aria-label={text} initial="hidden" whileInView="shown" viewport={{ once: true, margin: "-40px" }}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden>
          <motion.span
            className="inline-block"
            variants={{ hidden: { y: "110%" }, shown: { y: 0 } }}
            transition={{ duration: 0.9, delay: delay + i * 0.06, ease: EASE }}
          >
            {w}&nbsp;
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
      <span className="size-1.5 rounded-full bg-accent" />
      {children}
    </div>
  );
}

export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-full bg-accent px-6 text-[15px] font-medium text-accent-ink transition-transform active:scale-[0.97]"
    >
      <span className="absolute inset-0 -translate-x-full bg-white/40 transition-transform duration-700 ease-out group-hover:translate-x-full" style={{ clipPath: "polygon(20% 0, 45% 0, 25% 100%, 0 100%)" }} />
      <span className="relative">{children}</span>
      <svg className="relative transition-transform group-hover:translate-x-0.5" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M3 8h10m0 0L9 4m4 4l-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

export function GhostButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex h-12 items-center gap-2 rounded-full border border-line-strong px-6 text-[15px] text-fg transition-colors hover:bg-fg/5"
    >
      {children}
    </a>
  );
}
