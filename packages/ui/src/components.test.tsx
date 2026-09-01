import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CrewCard, type CrewCardData } from "./components";

const base: CrewCardData = {
  id: "x",
  displayName: "Mack Whitcombe",
  roles: ["CAPTAIN"],
  homePort: "Key West, FL",
  dayRateUsd: 550,
  yearsExperience: 23,
  fisheries: ["sailfish"],
  credentials: [{ kind: "USCG_LICENSE", licenseClass: "Master 50T", expiresAt: "2027-03-01", verified: true }],
  availability: [{ date: "2026-08-28", status: "OPEN" }],
  stats: { tripsCompleted: 10 },
};
const html = (crew: CrewCardData) =>
  renderToStaticMarkup(<CrewCard crew={crew} windowStart="2026-08-28" />);

describe("CrewCard — weigh-in board row", () => {
  it("renders no rank/registry ordinal (probe guard, M-2/P-4)", () => {
    expect(html(base)).not.toMatch(/REG\s|#\d/);
  });
  it("renders the 14-day availability strip (M-2 absence-is-closed)", () => {
    expect(html(base).match(/avail-strip__day(?!-)/g)).toHaveLength(14);
  });
  it("carries the crew-set-rates microcopy on the rate cell (M-2)", () => {
    expect(html(base)).toContain("sets own rate");
  });
  it("shows the seal only for admin-verified credentials (V-1)", () => {
    const un = { ...base, credentials: [{ ...base.credentials[0], verified: false }] };
    expect(html(base)).toContain("seal");
    expect(html(un)).not.toContain("seal");
    expect(html(un)).toContain("self-reported");
  });
  it("keeps license class + expiry at a glance (V-4)", () => {
    expect(html(base)).toContain("Master 50T");
    expect(html(base)).toContain("2027-03");
  });
});
