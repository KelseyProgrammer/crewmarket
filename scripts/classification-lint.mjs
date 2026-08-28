// classification-lint — M-1 compliance gate (docs/COMPLIANCE.md).
// Scans user-facing source and docs for employer-implying language that could
// undermine independent-contractor posture. Exit 1 on any violation.
//
// SOW 2.i lists a lint *stub* in scope; this is the full implementation (exceeds stub).
// Allow a flagged line intentionally with an inline marker: cl-allow
//
// Usage: node scripts/classification-lint.mjs [--staged]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

// Banned terms (rule M-1). Each entry: regex + why + suggested replacement.
// NOTE: these strings describe *prohibited* copy; this file is excluded from its own scan.
const RULES = [
  { re: /\bemployees?\b/i, why: "implies employment relationship", fix: 'use "crew member" / "independent contractor"' },
  // Negated uses ("not an employer") are the mandatory D-2 disclaimer — allowed.
  { re: /\bemployer\b/i, unless: /\b(not|never)\s+(an?\s+|the\s+)?employer\b|non-?employer/i, why: "casts the platform or booking as employment", fix: "restructure sentence; platform is a marketplace" },
  { re: /\bwages?\b/i, why: "wage language implies employment", fix: 'use "rate", "day rate", "payout"' },
  { re: /\bsalar(y|ies)\b/i, why: "salary implies employment", fix: 'use "rate"' },
  { re: /\bwe\s+hire\b/i, why: "platform does not hire", fix: 'crew "offer services"; boats "book" them' },
  { re: /\bhire\s+through\s+us\b/i, why: "platform is not a hiring agent", fix: '"book through Crew Market"' },
  { re: /\bour\s+crew\b/i, why: "possessive implies the platform supplies/employs crew", fix: '"crew on Crew Market", "independent crew"' },
  { re: /\bour\s+employees?\b/i, why: "implies employment", fix: "remove" },
  { re: /\bshifts?\s+(we\s+)?assign(ed)?\b/i, why: "assignment implies supervision (M-3)", fix: "crew accept bookings; nothing is assigned" },
  { re: /\bshift\s+assignments?\b/i, why: "assignment implies supervision (M-3)", fix: "remove feature/copy" },
  { re: /\bclock\s?-?\s?(in|out)\b/i, why: "timekeeping implies supervision (M-3)", fix: "trip start/complete states only" },
  { re: /\bperformance\s+review\b/i, why: "employer evaluation language (M-3)", fix: "peer marketplace reviews only" },
  { re: /\bstaff(ing)?\s+agency\b/i, why: "platform is not a crewing/staffing agency", fix: '"marketplace"' },
  { re: /\bpayroll\b/i, why: "payroll implies employment", fix: '"payouts via Stripe Connect"' },
];

// Scan targets: user-facing code + docs, plus root-level md (PRODUCT.md, DESIGN.md, README, etc).
// Exclusions: rule definitions & legal-analysis docs that must name the banned terms to ban them.
const INCLUDE_DIRS = ["apps", "packages", "docs", "scripts"];
const INCLUDE_ROOT_GLOB = /\.(md|mdx)$/;
const INCLUDE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".md", ".mdx", ".json", ".css", ".html"]);
const EXCLUDE_PATHS = new Set([
  "docs/COMPLIANCE.md",            // defines the banned terms
  "docs/SOW-AUDIT.md",             // quotes contract language
  "scripts/classification-lint.mjs",
  "scripts/classification-lint.impl.mjs",
]);
const EXCLUDE_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo", ".expo"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const violations = [];
const targets = [];
for (const top of INCLUDE_DIRS) {
  try { targets.push(...walk(join(ROOT, top))); } catch { /* dir absent */ }
}
for (const name of readdirSync(ROOT)) {
  const p = join(ROOT, name);
  if (statSync(p).isFile() && INCLUDE_ROOT_GLOB.test(name)) targets.push(p);
}
{
  const entries = targets;
  for (const file of entries) {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (EXCLUDE_PATHS.has(rel)) continue;
    if (![...INCLUDE_EXT].some((e) => rel.endsWith(e))) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes("cl-" + "allow")) return; // explicit, reviewable escape hatch
      for (const rule of RULES) {
        const m = line.match(rule.re);
        if (m && !(rule.unless && rule.unless.test(line)))
          violations.push({ rel, line: i + 1, term: m[0], why: rule.why, fix: rule.fix });
      }
    });
  }
}

if (violations.length) {
  console.error(`\nclassification-lint: ${violations.length} M-1 violation(s)\n`);
  for (const v of violations) {
    console.error(`  ${v.rel}:${v.line}  "${v.term}" — ${v.why}\n      → ${v.fix}`);
  }
  console.error("\nSee docs/COMPLIANCE.md rule M-1. Intentional exceptions: add an inline cl-" + "allow marker.\n");
  process.exit(1);
}
console.log("classification-lint: clean (M-1 gate passed).");
