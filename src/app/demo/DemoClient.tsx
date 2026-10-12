"use client";

import dynamic from "next/dynamic";

// Client-only: the demo restores your approvals from localStorage on load.
const DemoShell = dynamic(() => import("@/components/app/DemoShell").then((m) => m.DemoShell), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-screen place-items-center">
      <div className="size-2 animate-ping rounded-full bg-accent" aria-label="Loading demo" />
    </div>
  ),
});

export function DemoClient() {
  return <DemoShell />;
}
