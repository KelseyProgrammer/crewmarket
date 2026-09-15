import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seams = vi.hoisted(() => ({
  prisma: {
    booking: { findMany: vi.fn() },
    credentialDoc: { findMany: vi.fn(), count: vi.fn() },
    user: { count: vi.fn() },
  },
  stripeRevenue: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("@crewmarket/payments", () => ({ stripeRevenue: seams.stripeRevenue }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  seams.prisma.booking.findMany.mockResolvedValue([
    { state: "PAID_OUT", feeCents: 7200 },
    { state: "ESCROW_FUNDED", feeCents: 3600 },
  ]);
  seams.prisma.credentialDoc.findMany.mockResolvedValue([]);
  seams.prisma.credentialDoc.count.mockResolvedValue(0);
  seams.prisma.user.count.mockResolvedValue(0);
});
afterEach(() => vi.unstubAllEnvs());

async function load() {
  return (await import("./admin-metrics")).computeMetrics;
}

describe("computeMetrics revenue source", () => {
  it("falls back to simulated when STRIPE_SECRET_KEY is unset", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const computeMetrics = await load();
    const m = await computeMetrics();
    expect(m.revenue.source).toBe("simulated");
    expect(seams.stripeRevenue).not.toHaveBeenCalled();
    if (m.revenue.source === "simulated") {
      expect(m.revenue.realizedFeeCents).toBe(7200);
      expect(m.revenue.heldFeeCents).toBe(3600);
    }
  });

  it("uses Stripe when the key is set", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    seams.stripeRevenue.mockResolvedValue({
      grossChargesCents: 100800, refundsCents: 67200, crewPayoutsCents: 30000,
      platformFeesRetainedCents: 3600, availableCents: 194450, pendingCents: 66125,
    });
    const computeMetrics = await load();
    const m = await computeMetrics();
    expect(m.revenue.source).toBe("stripe");
    if (m.revenue.source === "stripe") {
      expect(m.revenue.platformFeesRetainedCents).toBe(3600);
      expect(m.revenue.availableCents).toBe(194450);
    }
  });

  it("falls back to simulated if Stripe throws", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    seams.stripeRevenue.mockRejectedValue(new Error("stripe down"));
    const computeMetrics = await load();
    const m = await computeMetrics();
    expect(m.revenue.source).toBe("simulated");
  });
});
