import * as FileSystem from "expo-file-system/legacy";
import type { PickedFile } from "./credential-upload";

/* Presigned-PUT upload + picker size resolution — NATIVE implementation
   (expo-file-system, exactly the calls the slice-4 device pass verified).
   Platform split because FileSystem throws on web: put-file.web.ts streams
   the picked blob through fetch instead. Contract shared by both: the
   presigned URL IS the auth — never attach auth headers to the PUT (V-2);
   only the Content-Type the signature covers. Keep signatures mirrored. */

/** PUT the picked file to storage; resolves to the HTTP status. */
export async function putFile(putUrl: string, file: PickedFile): Promise<number> {
  const res = await FileSystem.uploadAsync(putUrl, file.uri, {
    httpMethod: "PUT",
    headers: { "Content-Type": file.contentType },
  });
  return res.status;
}

/** Picker fileSize when present, else the filesystem's answer, else 0
 *  (0 fails validateUpload, so an unknowable size never reaches storage). */
export async function resolveSize(uri: string, fromAsset: number | undefined): Promise<number> {
  if (typeof fromAsset === "number" && fromAsset > 0) return fromAsset;
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists && typeof info.size === "number" ? info.size : 0;
}
