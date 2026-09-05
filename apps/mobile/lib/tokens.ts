// Mirrors packages/ui/src/tokens.css — that file is the source of truth;
// update both or extract a package when a third consumer appears.
//
// The weigh-in board: tournament board rows, monumental condensed caps,
// navy/white/brass. Brass is a closed four-entry ledger (root DESIGN.md
// "Brass Ledger"): verification, the primary action, the availability
// strip's open-day fill, and the display accent. The board lists; it
// never ranks — no ordinals anywhere (M-2/P-4).

export const color = {
  navyDeep: "#0a1d30",
  navyPanel: "#12314e",
  whiteCrisp: "#f8fafb",
  boardBg: "#f6f7f8", // page ground; rows sit white on this
  brass: "#a9822f", // graphic/large-accent brass: seal ring, borders, focus, >=3:1
  brassText: "#8a6a1e", // text-grade brass on white fields: 5.05:1, AA for small text
  brassBright: "#d7b36a",
  mist: "#8fa6ba",
  navyMuted: "#b7c6d4", // long-form text on navy

  // derived
  ink: "#10222f", // body text on white
  inkSoft: "#4a5c6b", // secondary text on white
  lineOnWhite: "rgba(16, 34, 47, 0.14)",
  lineStrong: "rgba(16, 34, 47, 0.3)",
  lineOnNavy: "rgba(143, 166, 186, 0.28)",
  brassEngrave: "rgba(169, 130, 47, 0.45)",
} as const;

export const font = {
  display: "Oswald_500Medium", // fallback stack on web is Oswald, Archivo, sans-serif
  body: "Archivo_400Regular", // fallback stack on web is Archivo, system-ui, sans-serif
  mono: "MartianMono_400Regular", // fallback stack on web is Martian Mono, ui-monospace, monospace
} as const;

// scale (4px grid)
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 24,
  s6: 32,
  s7: 48,
  s8: 64,
  s9: 96,
} as const;

export const radius = 2; // plate, not pill
export const measure = 62; // ch, approximated as a character-count cap on web-only layouts
