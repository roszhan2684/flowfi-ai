"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "../shared/Logo";
import { ThemeToggle } from "../shared/ThemeToggle";

const LINKS = [
  ["Film", "#film"],
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
      className="fixed inset-x-0 top-0 z-50"
      animate={{ y: hidden ? -90 : 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <nav
        className={`flex h-16 w-full items-center justify-between border-b px-5 transition-all duration-500 md:px-10 xl:px-16 ${
          scrolled ? "border-line bg-bg/75 backdrop-blur-xl" : "border-transparent"
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
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/demo" className="inline-flex h-9 items-center rounded-full bg-fg px-4 text-[13px] font-medium text-bg transition-transform active:scale-95">
            Open demo
          </Link>
        </div>
      </nav>
    </motion.header>
  );
}
