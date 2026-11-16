export function PawIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <circle cx="6" cy="10" r="2" />
      <circle cx="10" cy="5" r="2" />
      <circle cx="14" cy="5" r="2" />
      <circle cx="18" cy="10" r="2" />
      <path d="M12 13c-3 0-5 3-5 5.5 0 1.5 1.5 2 3 1.5s2.5-.5 4 0 3 0 3-1.5c0-2.5-2-5.5-5-5.5z" />
    </svg>
  );
}

export function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-brand text-white">
        <PawIcon />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-base font-bold">Adiestra</span>
        {subtitle && <span className="max-w-40 truncate text-xs text-muted">{subtitle}</span>}
      </div>
    </div>
  );
}
