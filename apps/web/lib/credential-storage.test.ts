import { beforeEach, describe, expect, it, vi } from "vitest";

/* ensureBucket contract (R2 swap, 10/6/2026): the deployed token is Object
   Read & Write scoped to one existing bucket — it has NO CreateBucket right.
   Bucket readiness must therefore be probed with HeadBucket, and CreateBucket
   attempted only when the probe says the bucket is missing (dev MinIO starts
   empty). An unconditional CreateBucket 500s in production (AccessDenied). */

vi.mock("server-only", () => ({}));

const seams = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class Cmd {
    constructor(public input: Record<string, unknown>) {}
  }
  return {
    S3Client: class {
      send = seams.send;
    },
    HeadBucketCommand: class extends Cmd {},
    CreateBucketCommand: class extends Cmd {},
    GetObjectCommand: class extends Cmd {},
    HeadObjectCommand: class extends Cmd {},
    DeleteObjectCommand: class extends Cmd {},
    PutObjectCommand: class extends Cmd {},
  };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://signed.example/url"),
}));

async function freshModule() {
  vi.resetModules();
  return import("./credential-storage");
}

function sentNames(): string[] {
  return seams.send.mock.calls.map((c) => (c[0] as object).constructor.name);
}

beforeEach(() => {
  seams.send.mockReset();
});

describe("ensureBucket against a pre-existing bucket (R2 object-scoped token)", () => {
  it("presigns without ever sending CreateBucket when HeadBucket succeeds", async () => {
    seams.send.mockImplementation(async (cmd: object) => {
      if (cmd.constructor.name === "HeadBucketCommand") return {};
      if (cmd.constructor.name === "CreateBucketCommand") {
        const err = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
        throw err;
      }
      return {};
    });
    const storage = await freshModule();
    await expect(storage.presignedPut("credentials/p1/doc1.pdf", "application/pdf", 10)).resolves.toBe(
      "https://signed.example/url",
    );
    expect(sentNames()).toContain("HeadBucketCommand");
    expect(sentNames()).not.toContain("CreateBucketCommand");
  });
});

describe("ensureBucket against an empty dev store (MinIO)", () => {
  it("creates the bucket when the probe says it is missing", async () => {
    seams.send.mockImplementation(async (cmd: object) => {
      if (cmd.constructor.name === "HeadBucketCommand") {
        const err = Object.assign(new Error("NotFound"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        });
        throw err;
      }
      return {};
    });
    const storage = await freshModule();
    await expect(storage.presignedPut("credentials/p1/doc1.pdf", "application/pdf", 10)).resolves.toBe(
      "https://signed.example/url",
    );
    expect(sentNames()).toContain("CreateBucketCommand");
  });

  it("a losing CreateBucket race (BucketAlreadyOwnedByYou) is benign", async () => {
    seams.send.mockImplementation(async (cmd: object) => {
      if (cmd.constructor.name === "HeadBucketCommand") {
        const err = Object.assign(new Error("NotFound"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        });
        throw err;
      }
      if (cmd.constructor.name === "CreateBucketCommand") {
        const err = Object.assign(new Error("owned"), { name: "BucketAlreadyOwnedByYou" });
        throw err;
      }
      return {};
    });
    const storage = await freshModule();
    await expect(storage.presignedPut("credentials/p1/doc1.pdf", "application/pdf", 10)).resolves.toBe(
      "https://signed.example/url",
    );
  });
});
