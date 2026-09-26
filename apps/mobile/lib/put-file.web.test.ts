import { afterEach, describe, expect, it, vi } from "vitest";
import { putFile, resolveSize } from "./put-file.web";

// Web upload shim: expo-file-system's uploadAsync/getInfoAsync throw on web,
// so the platform file streams the picked blob: URI through fetch instead.
// The presigned URL IS the auth — the PUT must carry no auth headers, only
// the Content-Type the signature was computed over (V-2 mirror of the
// native path in put-file.ts).

function stubFetch(routes: Record<string, unknown>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const hit = routes[url];
    if (!hit) return Promise.reject(new Error("unroutable " + url));
    return Promise.resolve(hit);
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("putFile (web)", () => {
  it("PUTs the picked blob to the presigned URL with only the Content-Type header", async () => {
    const blob = new Blob(["fake-pdf-bytes"], { type: "application/pdf" });
    const calls = stubFetch({
      "blob:doc-uri": { blob: () => Promise.resolve(blob) },
      "https://s3.example/put?sig=1": { status: 200 },
    });
    const status = await putFile("https://s3.example/put?sig=1", {
      uri: "blob:doc-uri",
      contentType: "application/pdf",
      sizeBytes: 14,
    });
    expect(status).toBe(200);
    const put = calls[1];
    expect(put?.init?.method).toBe("PUT");
    expect(put?.init?.headers).toEqual({ "Content-Type": "application/pdf" });
    expect(put?.init?.body).toBe(blob);
  });

  it("surfaces a non-2xx storage status to the caller", async () => {
    const blob = new Blob(["x"]);
    stubFetch({
      "blob:doc-uri": { blob: () => Promise.resolve(blob) },
      "https://s3.example/put": { status: 403 },
    });
    await expect(
      putFile("https://s3.example/put", { uri: "blob:doc-uri", contentType: "image/png", sizeBytes: 1 }),
    ).resolves.toBe(403);
  });
});

describe("resolveSize (web)", () => {
  it("trusts a positive size from the picker asset without fetching", async () => {
    const calls = stubFetch({});
    await expect(resolveSize("blob:whatever", 1234)).resolves.toBe(1234);
    expect(calls.length).toBe(0);
  });

  it("falls back to the blob's own size when the asset omits it", async () => {
    stubFetch({ "blob:doc-uri": { blob: () => Promise.resolve(new Blob(["12345"])) } });
    await expect(resolveSize("blob:doc-uri", undefined)).resolves.toBe(5);
  });

  it("returns 0 when the URI can't be read (validation will reject it)", async () => {
    stubFetch({});
    await expect(resolveSize("blob:gone", undefined)).resolves.toBe(0);
  });
});
