/* Chart-room engravings (root DESIGN.md "Chart-Room Engravings") — line-drawn
   instrument marks, stroke-only with square caps, mirroring
   apps/mobile/components/engravings.tsx geometry exactly (keep in lockstep).
   Ornament Ink Rule: these draw in mist/ink via currentColor — never brass;
   the VerifiedSeal in components.tsx is the system's only brass engraving. */

export function CompassRose({ size = 200, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle
        cx="50"
        cy="50"
        r="30"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      {/* cardinals long, intercardinals short — a chart compass, not a dial */}
      <line x1="50" y1="4" x2="50" y2="42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      <line x1="50" y1="58" x2="50" y2="96" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      <line x1="4" y1="50" x2="42" y2="50" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      <line x1="58" y1="50" x2="96" y2="50" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      <line x1="26" y1="26" x2="38" y2="38" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
      <line x1="62" y1="62" x2="74" y2="74" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
      <line x1="74" y1="26" x2="62" y2="38" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
      <line x1="38" y1="62" x2="26" y2="74" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
      <circle cx="50" cy="50" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function AnchorMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="50" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="6" />
      <line x1="50" y1="25" x2="50" y2="84" stroke="currentColor" strokeWidth="6" strokeLinecap="square" />
      <line x1="30" y1="38" x2="70" y2="38" stroke="currentColor" strokeWidth="6" strokeLinecap="square" />
      <path d="M 20 58 A 30 30 0 0 0 80 58" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="square" />
      <line x1="20" y1="58" x2="13" y2="48" stroke="currentColor" strokeWidth="6" strokeLinecap="square" />
      <line x1="80" y1="58" x2="87" y2="48" stroke="currentColor" strokeWidth="6" strokeLinecap="square" />
    </svg>
  );
}
