// Shared role-label map. board-row.tsx (Task 3, already committed) keeps its
// own inline ROLE_LABELS copy — it is not exported and this file must not
// rewrite that component — so this is the map new screens should import from
// rather than adding a third inline copy. Mirrors apps/web/app/crew/[id]/page.tsx
// ROLE_LABELS and apps/web/app/directory/page.tsx ROLE_OPTIONS labels verbatim.
// If board-row.tsx is ever touched again, it should import from here too.

export const ROLE_LABELS: Record<string, string> = {
  CAPTAIN: "Captain",
  SECOND_CAPTAIN: "Second Captain",
  MATE: "Mate",
  DECKHAND: "Deckhand",
  ENGINEER: "Engineer",
  COOK: "Cook",
  STEWARDESS: "Stewardess",
};
