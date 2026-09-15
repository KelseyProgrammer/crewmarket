import { describe, expect, it } from "vitest";
import { claimButtonState } from "./claim-state";

const me = (over = {}) => ({ id: "u1", accountType: "CREW", claimedProfileId: null, ...over });

describe("claimButtonState", () => {
  it("signed out -> prompt to sign in", () => {
    expect(claimButtonState(null, "p1")).toBe("SIGNED_OUT");
  });
  it("boat -> hidden", () => {
    expect(claimButtonState(me({ accountType: "BOAT" }), "p1")).toBe("HIDDEN");
  });
  it("crew, no claim -> claimable", () => {
    expect(claimButtonState(me(), "p1")).toBe("CLAIMABLE");
  });
  it("crew, this profile is theirs -> owned", () => {
    expect(claimButtonState(me({ claimedProfileId: "p1" }), "p1")).toBe("OWNED");
  });
  it("crew, drives a different profile -> hidden", () => {
    expect(claimButtonState(me({ claimedProfileId: "p2" }), "p1")).toBe("HIDDEN");
  });
});
