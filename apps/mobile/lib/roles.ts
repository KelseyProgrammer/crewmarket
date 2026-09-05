// Shared role-label map. This is the map screens and components should
// import from rather than adding an inline copy. Mirrors
// apps/web/app/crew/[id]/page.tsx ROLE_LABELS and apps/web/app/directory/page.tsx
// ROLE_OPTIONS labels verbatim.

export const ROLE_LABELS: Record<string, string> = {
  CAPTAIN: "Captain",
  SECOND_CAPTAIN: "Second Captain",
  MATE: "Mate",
  DECKHAND: "Deckhand",
  ENGINEER: "Engineer",
  COOK: "Cook",
  STEWARDESS: "Stewardess",
};
