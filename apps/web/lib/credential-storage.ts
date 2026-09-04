import "server-only";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/* Credential doc storage (V-2): private bucket, presigned-only, short expiries.
   MinIO in dev; the client's AWS bucket later is an env swap (S3_ENDPOINT unset).
   Never log keys or URLs from this module. */

const BUCKET = process.env.S3_BUCKET ?? "credential-docs";

const client = new S3Client({
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});

let bucketReady: Promise<void> | null = null;
function ensureBucket(): Promise<void> {
  bucketReady ??= client
    .send(new CreateBucketCommand({ Bucket: BUCKET }))
    .then(() => undefined)
    .catch((err: { name?: string }) => {
      if (err.name === "BucketAlreadyOwnedByYou" || err.name === "BucketAlreadyExists") return;
      bucketReady = null; // retry on next call rather than caching the failure
      throw err;
    });
  return bucketReady;
}

const PUT_EXPIRY_S = 60;
const GET_EXPIRY_S = 60;

export async function presignedPut(key: string, contentType: string, sizeBytes: number): Promise<string> {
  await ensureBucket();
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
    { expiresIn: PUT_EXPIRY_S }
  );
}

export async function presignedGet(key: string): Promise<string> {
  await ensureBucket();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
    expiresIn: GET_EXPIRY_S,
  });
}

/** Confirms the client's PUT actually landed; returns real size/type or null. */
export async function headObject(key: string): Promise<{ sizeBytes: number; contentType: string } | null> {
  await ensureBucket();
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { sizeBytes: head.ContentLength ?? 0, contentType: head.ContentType ?? "" };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await ensureBucket();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => undefined);
}
