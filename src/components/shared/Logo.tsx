export function LogoMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="7" fill="currentColor" opacity="0.12" />
      <path
        d="M4.5 15.5c2.2 0 3-6 5.3-6s2.4 4.2 4.4 4.2 2.5-5.2 5.3-5.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19.5" cy="8.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-medium tracking-tight ${className}`}>
      <LogoMark />
      FlowFi
    </span>
  );
}
