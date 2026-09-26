import type { PickedFile } from "./credential-upload";

/* Presigned-PUT upload + picker size resolution — WEB implementation.
   expo-file-system's uploadAsync/getInfoAsync throw on web, so this platform
   file reads the picker's blob: URI and PUTs it with fetch. Same contract as
   put-file.ts (native): the presigned URL IS the auth — no auth headers on
   the PUT (V-2), only the Content-Type the signature covers. Keep
   signatures mirrored. */

/** PUT the picked file to storage; resolves to the HTTP status. */
export async function putFile(putUrl: string, file: PickedFile): Promise<number> {
  const blob = await (await fetch(file.uri)).blob();
  const res = await fetch(putUrl, {
    method: "PUT",
    headers: { "Content-Type": file.contentType },
    body: blob,
  });
  return res.status;
}

/** Picker fileSize when present, else the blob's own size, else 0
 *  (0 fails validateUpload, so an unknowable size never reaches storage). */
export async function resolveSize(uri: string, fromAsset: number | undefined): Promise<number> {
  if (typeof fromAsset === "number" && fromAsset > 0) return fromAsset;
  try {
    return (await (await fetch(uri)).blob()).size;
  } catch {
    return 0;
  }
}
