import { describe, expect, it, vi } from "vitest";
import { createTtlCache } from "./ttl-cache";

describe("createTtlCache", () => {
  it("loads once inside the TTL", async () => {
    const load = vi.fn(async () => "v1");
    const cache = createTtlCache(load, 30_000);
    expect(await cache.get(1_000)).toBe("v1");
    expect(await cache.get(20_000)).toBe("v1");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after expiry", async () => {
    let n = 0;
    const load = vi.fn(async () => `v${++n}`);
    const cache = createTtlCache(load, 30_000);
    expect(await cache.get(1_000)).toBe("v1");
    expect(await cache.get(31_001)).toBe("v2");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("concurrent misses share one in-flight load", async () => {
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const cache = createTtlCache(load, 30_000);
    const [a, b] = [cache.get(1_000), cache.get(1_000)];
    resolve("v1");
    expect(await a).toBe("v1");
    expect(await b).toBe("v1");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("a failed load is not cached — the next get retries", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce("v1");
    const cache = createTtlCache(load, 30_000);
    await expect(cache.get(1_000)).rejects.toThrow("db down");
    expect(await cache.get(1_001)).toBe("v1");
  });
});
