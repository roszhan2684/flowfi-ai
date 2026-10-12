"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "../shared/Logo";

const LINKS = [
  ["Forecast", "#forecast"],
  ["Copilot", "#copilot"],
  ["Reliability", "#reliability"],
];

export function Nav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(v > 24);
    setHidden(v > 600 && v > prev + 4);
    if (v < prev - 4) setHidden(false);
  });

  return (
    <motion.header
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4"
      animate={{ y: hidden ? -90 : 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <nav
        className={`flex h-12 w-full max-w-5xl items-center justify-between rounded-full pr-1.5 pl-5 transition-all duration-500 ${
          scrolled ? "border border-line bg-surface/70 shadow-2xl shadow-black/40 backdrop-blur-xl" : "border border-transparent"
        }`}
      >
        <Link href="/" className="text-fg" aria-label="FlowFi home">
          <Logo className="text-[15px]" />
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} className="rounded-full px-4 py-2 text-[13px] text-muted transition-colors hover:text-fg">
              {label}
            </a>
          ))}
        </div>
        <Link href="/demo" className="inline-flex h-9 items-center rounded-full bg-fg px-4 text-[13px] font-medium text-bg transition-transform active:scale-95">
          Open demo
        </Link>
      </nav>
    </motion.header>
  );
}
