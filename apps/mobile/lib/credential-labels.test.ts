import { describe, expect, it } from "vitest";
import { CREDENTIAL_KINDS, KIND_LABELS, kindLabel, stateLabel } from "./credential-labels";

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
});
