"use client";

import { useRef, useState, useTransition } from "react";
import { beginCredentialUpload, confirmCredentialUpload } from "./credential-actions";

/* Three-step upload: authorize (server) → PUT directly to storage → confirm
   (server re-verifies via HeadObject). The file never passes through our
   server process; only the presigned URL touches it (V-2). */

export function CredentialUploadForm({ kinds }: { kinds: readonly string[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submitting = useRef(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file") as File | null;
    if (!file || file.size === 0) return setError("Choose a file.");
    setError(null);
    submitting.current = true;
    startTransition(async () => {
      try {
        const begin = await beginCredentialUpload({
          kind: String(data.get("kind")),
          contentType: file.type,
          sizeBytes: file.size,
        });
        if ("error" in begin) return setError(begin.error);
        try {
          const put = await fetch(begin.putUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
          });
          if (!put.ok) return setError("Upload didn't complete — try again.");
        } catch {
          return setError("Upload didn't complete — check your connection and try again.");
        }
        const confirm = await confirmCredentialUpload({
          docId: begin.docId,
          s3Key: begin.s3Key,
          kind: String(data.get("kind")),
          licenseClass: String(data.get("licenseClass") ?? ""),
          expiresAt: String(data.get("expiresAt") ?? ""),
        });
        if (confirm.error) return setError(confirm.error);
        formRef.current?.reset();
      } catch {
        setError("Something went wrong on our end — try again.");
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <form ref={formRef} className="credform" onSubmit={onSubmit}>
      <label>
        Credential type
        <select name="kind" required defaultValue="">
          <option value="" disabled>Choose…</option>
          {kinds.map((k) => (
            <option key={k} value={k}>{k.replaceAll("_", " ")}</option>
          ))}
        </select>
      </label>
      <label>
        License class <span className="credform__opt">(optional)</span>
        <input name="licenseClass" type="text" placeholder="e.g. Master 100T" maxLength={80} />
      </label>
      <label>
        Expires <span className="credform__opt">(optional)</span>
        <input name="expiresAt" type="date" />
      </label>
      <label>
        Document (PDF, JPEG, or PNG — max 10 MB)
        <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
      </label>
      {error ? <p className="credform__error" role="alert">{error}</p> : null}
      <button className="btn btn--brass" type="submit" disabled={pending}>
        {pending ? "Uploading…" : "Upload for review"}
      </button>
    </form>
  );
}
