// generate-seed.mjs — deterministic synthetic seed data (SOW 2.i: ~25 South FL crew profiles).
// Rule G-alignment: all data is fictional (SOW 6.i "synthetic, not real crew or customer information").
// Run: node scripts/generate-seed.mjs  → writes apps/web/data/seed-crew.json
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Deterministic PRNG (mulberry32) so the seed file is reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260827); // SOW signature date as seed
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const picks = (arr, n) => {
  const copy = [...arr], out = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
};
const uuid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

// Synthetic names — fictional, not sampled from any real roster.
const FIRST = ["Mack", "Rey", "Tavo", "June", "Del", "Coral", "Bo", "Marlin", "Skip", "Wren", "Cass", "Río", "Teal", "Harbor", "Nash", "Sunny", "Drift", "Keys", "Ledge", "Gaff", "Perla", "Cove", "Reef", "Banks", "Tide"];
const LAST = ["Whitcombe", "Alvarado", "Kessler", "Duarte", "Pinder", "Halvorsen", "Ostrander", "Quintana", "Barlowe", "Steadman", "Ferrell", "Mancuso", "Yates", "Delacroix", "Hobbs", "Vickery", "Santana", "Croft", "Ibarra", "Palmer", "Rousseau", "Wexford", "Nakata", "Griggs", "Boudreau"];

const PORTS = ["Islamorada, FL", "Key West, FL", "Marathon, FL", "Key Largo, FL", "Miami, FL", "Fort Lauderdale, FL", "Pompano Beach, FL", "Lighthouse Point, FL", "Palm Beach, FL", "Jupiter, FL", "Stuart, FL", "Boca Raton, FL"];
const REGIONS = ["Upper Keys", "Lower Keys", "Miami–Dade", "Broward", "Palm Beach", "Treasure Coast", "Bahamas runs"];
const FISHERIES = ["sailfish", "kite fishing", "offshore troll", "daytime swordfish", "mahi run", "bottom / deep drop", "tournament", "wreck & reef", "live bait"];
const VESSELS = ["sportfisher 40–60ft", "sportfisher 60ft+", "center console", "express", "outriggers/kites rigging", "seakeeper-equipped", "cat hulls"];
const BIOS = [
  "Season after season on the same docks. Rig clean, bait ready before lines-in.",
  "Grew up pin-rigging the reef edge. Calm hands on a hot bite.",
  "Tournament-tested. Leader wind-ons, kite spreads, no drama in the cockpit.",
  "Quiet, early, thorough. The spread is set before the sun is.",
  "Ten seasons of charter turnarounds. Fast washdowns, careful with the boat.",
  "Deep-drop specialist — electric reels, tile and swords, own tackle available.",
  "Bilingual (EN/ES). Good with owners, better with fish.",
  "Delivery-capable, keeps a tight log, treats every trip like a survey run.",
];

const ROLES = ["MATE", "DECKHAND", "CAPTAIN", "SECOND_CAPTAIN", "ENGINEER", "COOK"];

function credentialFor(role, i, verifiedBias) {
  const creds = [];
  const verified = rand() < verifiedBias; // rule V-1: verified is admin-set; seed models post-review state
  if (role === "CAPTAIN" || role === "SECOND_CAPTAIN") {
    const cls = pick(["Master 100T", "Master 50T", "OUPV 6-pack"]);
    creds.push({
      kind: cls === "OUPV 6-pack" ? "USCG_OUPV" : "USCG_MASTER_25_50_100",
      licenseClass: cls,
      expiresAt: `202${7 + Math.floor(rand() * 3)}-0${1 + Math.floor(rand() * 9)}-15`,
      verified,
    });
  }
  if (rand() < 0.7) creds.push({ kind: "CPR_FIRST_AID", verified: verified && rand() < 0.8 });
  if (rand() < 0.35) creds.push({ kind: "STCW_BASIC", verified: verified && rand() < 0.6 });
  if (rand() < 0.3) creds.push({ kind: "TWIC", verified: verified && rand() < 0.6 });
  return creds;
}

function availability(days) {
  const out = [];
  const start = new Date("2026-08-28T00:00:00Z");
  for (let d = 0; d < days; d++) {
    const date = new Date(start.getTime() + d * 86400000).toISOString().slice(0, 10);
    const r = rand();
    out.push({ date, status: r < 0.55 ? "OPEN" : r < 0.8 ? "BOOKED" : "UNAVAILABLE" });
  }
  return out;
}

const profiles = [];
for (let i = 0; i < 25; i++) {
  const primaryRole = i < 7 ? "CAPTAIN" : i < 9 ? "SECOND_CAPTAIN" : i < 18 ? "MATE" : i < 23 ? "DECKHAND" : pick(["ENGINEER", "COOK"]);
  const roles = [primaryRole, ...(rand() < 0.35 ? picks(ROLES.filter((r) => r !== primaryRole), 1) : [])];
  const isCapt = primaryRole === "CAPTAIN" || primaryRole === "SECOND_CAPTAIN";
  const dayRateUsd = isCapt ? 500 + Math.floor(rand() * 9) * 50 : 250 + Math.floor(rand() * 9) * 25; // rule M-2: crew-set rates (synthetic here)
  profiles.push({
    id: uuid(i + 1),
    displayName: `${FIRST[i]} ${LAST[i]}`,
    roles,
    homePort: pick(PORTS),
    regions: picks(REGIONS, 1 + Math.floor(rand() * 3)),
    yearsExperience: 2 + Math.floor(rand() * 24),
    fisheries: picks(FISHERIES, 2 + Math.floor(rand() * 3)),
    vesselExperience: picks(VESSELS, 1 + Math.floor(rand() * 3)),
    dayRateUsd,
    ...(rand() < 0.6 ? { halfDayRateUsd: Math.round(dayRateUsd * 0.65) } : {}),
    ...(rand() < 0.4 ? { tournamentRateUsd: Math.round(dayRateUsd * 1.6) } : {}),
    bio: pick(BIOS),
    photoRefs: [],
    credentials: credentialFor(primaryRole, i, isCapt ? 0.75 : 0.5),
    availability: availability(14),
    stats: {
      tripsCompleted: Math.floor(rand() * 120),
      ...(rand() < 0.8 ? { avgRating: Math.round((3.9 + rand() * 1.1) * 10) / 10 } : {}),
      ...(rand() < 0.7 ? { responseRate: Math.round((0.7 + rand() * 0.3) * 100) / 100 } : {}),
    },
  });
}

const outPath = resolve(root, "apps/web/data/seed-crew.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ generatedBy: "scripts/generate-seed.mjs", synthetic: true, profiles }, null, 2));
console.log(`Wrote ${profiles.length} synthetic profiles → ${outPath}`);
