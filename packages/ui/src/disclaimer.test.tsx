import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DisclaimerD2 } from "./components";

// docs/COMPLIANCE.md rule D-2 — this sentence is verbatim and mandatory.
// If this test fails, the component drifted: fix the component, never this constant.
const D2 =
  "Crew Market is a directory and booking marketplace. We are not an employer, " +
  "crewing agency, or vessel operator. Vessel owners are solely responsible for " +
  "crew selection, vessel operation, and legal compliance including insurance.";

describe("DisclaimerD2 (rule D-2)", () => {
  it("renders the COMPLIANCE.md sentence verbatim", () => {
    const text = renderToStaticMarkup(<DisclaimerD2 />)
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    expect(text).toBe(D2);
  });
});
