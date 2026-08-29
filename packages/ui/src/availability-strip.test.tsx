import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AvailabilityStrip } from "./availability";

const av = [{ date: "2026-08-29", status: "OPEN" }];

describe("AvailabilityStrip", () => {
  it("renders one cell per day with open state as a class", () => {
    const html = renderToStaticMarkup(
      <AvailabilityStrip av={av} start="2026-08-29" days={3} />
    );
    expect(html.match(/avail-strip__day(?!-)/g)).toHaveLength(3);
    expect(html.match(/avail-strip__day--open/g)).toHaveLength(1);
  });

  it("carries an accessible summary with the true open count", () => {
    const html = renderToStaticMarkup(
      <AvailabilityStrip av={av} start="2026-08-29" days={14} />
    );
    expect(html).toContain('aria-label="1 of next 14 days open"');
  });
});
