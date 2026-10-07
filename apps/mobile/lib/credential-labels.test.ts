import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_KINDS,
  KIND_LABELS,
  kindLabel,
  removeConfirmMessage,
  stateLabel,
} from "./credential-labels";

describe("credential labels", () => {
  it("every credential kind from the shared schema has a label", () => {
    for (const kind of CREDENTIAL_KINDS) {
      expect(KIND_LABELS[kind], `missing label for ${kind}`).toBeTruthy();
    }
  });

  it("unknown kinds fall back to the raw key", () => {
    expect(kindLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  it("state copy mirrors the web exactly — about the document, never competence (V-1/V-3)", () => {
    expect(stateLabel(true)).toBe("Verified — document reviewed");
    expect(stateLabel(false)).toBe("Self-reported — awaiting review");
  });

  it("remove-confirm copy tells verified-doc owners a record is kept (deletion policy 2026-10-06)", () => {
    expect(removeConfirmMessage(false)).toBe("This deletes the file and its record.");
    expect(removeConfirmMessage(true)).toBe(
      "This deletes the file. A record that a verified document existed and was removed is kept.",
    );
  });
});
