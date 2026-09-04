import { prisma } from "@crewmarket/db";
import { claimedProfileId } from "../../lib/bookings";
import { CREDENTIAL_KINDS } from "../../lib/credential-rules";
import { CredentialUploadForm } from "./credential-upload-form";
import { deleteCredentialDoc, viewOwnCredentialDoc } from "./credential-actions";

/* V-1: verified vs self-reported visually distinct. V-3: verified wording is
   about document review, never competence. Docs are owner/admin-visible only —
   the public profile shows structured fields, never the file (V-2). */

const KIND_LABELS: Record<string, string> = {
  USCG_OUPV: "USCG OUPV (6-pack)",
  USCG_MASTER_25_50_100: "USCG Master",
  STCW_BASIC: "STCW Basic Training",
  CPR_FIRST_AID: "CPR / First Aid",
  TWIC: "TWIC",
  STATE_CHARTER_LICENSE: "State Charter License",
  OTHER: "Other credential",
};

export async function CredentialsSection({ userId, notice }: { userId: string; notice?: boolean }) {
  const profileId = await claimedProfileId(userId);
  if (!profileId) return null; // no claim, no upload surface — the account shell copy covers this

  const docs = await prisma.credentialDoc.findMany({
    where: { profileId },
    orderBy: { uploadedAt: "desc" },
  });

  return (
    <div className="account__panel">
      <span className="eyebrow">CREDENTIALS</span>
      <p className="account__lede">
        Upload license and certification documents for admin review. Verification means an
        admin reviewed the document — the brass seal is earned, never self-set. Documents
        stay private; your public listing shows only the credential details.
      </p>
      {notice ? (
        <p className="credform__error" role="alert">
          That document isn&apos;t available from this account — reload the page.
        </p>
      ) : null}
      {docs.length > 0 ? (
        <ul className="credlist">
          {docs.map((d) => (
            <li key={d.id} className="credlist__row">
              <span className="credlist__kind">{KIND_LABELS[d.kind] ?? d.kind}</span>
              {d.licenseClass ? <span className="credlist__class">{d.licenseClass}</span> : null}
              {d.expiresAt ? (
                <span className="credlist__exp">
                  expires {d.expiresAt.toISOString().slice(0, 10)}
                </span>
              ) : null}
              <span className={d.verifiedAt ? "credlist__state credlist__state--verified" : "credlist__state"}>
                {d.verifiedAt ? "Verified — document reviewed" : "Self-reported — awaiting review"}
              </span>
              <form action={viewOwnCredentialDoc}>
                <input type="hidden" name="docId" value={d.id} />
                <button className="btn btn--ghost-ink" type="submit">View</button>
              </form>
              <form action={deleteCredentialDoc}>
                <input type="hidden" name="docId" value={d.id} />
                <button className="btn btn--ghost-ink" type="submit">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="credlist__empty">No documents uploaded yet.</p>
      )}
      <CredentialUploadForm kinds={CREDENTIAL_KINDS as readonly string[]} />
    </div>
  );
}
