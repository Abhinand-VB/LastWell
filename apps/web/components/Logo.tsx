// The LastWell mark: a voice waveform whose tallest, centre bar is red (the moment the stroke is heard).
// Redrawn as SVG from the brand PNG so it stays sharp at nav size; app/icon.svg is the favicon version.

const BARS: { x: number; h: number; red?: boolean }[] = [
  { x: 0, h: 56 },
  { x: 50, h: 110 },
  { x: 100, h: 182 },
  { x: 150, h: 258, red: true },
  { x: 200, h: 166 },
  { x: 250, h: 104 },
  { x: 300, h: 42 },
];

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 328 258" className={className} aria-hidden="true">
      {BARS.map((b) => (
        <rect
          key={b.x}
          x={b.x}
          y={(258 - b.h) / 2}
          width={28}
          height={b.h}
          rx={14}
          fill={b.red ? "var(--color-lw-danger)" : "currentColor"}
        />
      ))}
    </svg>
  );
}

/** Mark + wordmark, as in the brand logo. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5 text-lw-ink">
      <LogoMark className="h-7 w-auto" />
      <span className="text-2xl font-extrabold tracking-tight">LastWell</span>
    </span>
  );
}
