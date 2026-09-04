import { notFound } from "next/navigation";
import { Container } from "@crewmarket/ui";
import { prisma } from "@crewmarket/db";
import { crewProfileById, sessionUser } from "../../../lib/bookings";
import { isAdminEmail } from "../../../lib/credential-rules";
import { setCredentialVerified, viewCredentialDocAsAdmin } from "./actions";

/* Admin credential review (V-1). Gate = ADMIN_EMAILS env allowlist; page 404s
   for everyone else (route stays unadvertised — no nav link anywhere).
   Scope by rule: view + verified toggle, nothing more (SOW 2.ii). */

export const metadata = { title: "Credential review — Crew Market" };

export default async function AdminCredentials() {
  const user = await sessionUser();
  if (!user || !isAdminEmail(user.email, process.env.ADMIN_EMAILS)) notFound();

  const docs = await prisma.credentialDoc.findMany({
    orderBy: [{ verifiedAt: { sort: "asc", nulls: "first" } }, { uploadedAt: "desc" }],
    include: { uploadedBy: { select: { email: true } } },
  });

  return (
    <main className="admincreds">
      <Container wide>
        <span className="eyebrow">ADMIN · CREDENTIAL REVIEW</span>
        <h1>Uploaded credential documents</h1>
        <p>
          Verifying means: the document exists and matches the listed name and details.
          It is a document review, not a competence assessment.
        </p>
        {docs.length === 0 ? (
          <p>No documents awaiting review.</p>
        ) : (
          <table className="admincreds__table">
            <thead>
              <tr>
                <th>Profile</th><th>Kind</th><th>Class</th><th>Expires</th>
                <th>Uploaded</th><th>By</th><th>State</th><th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>{crewProfileById(d.profileId)?.displayName ?? d.profileId}</td>
                  <td>{d.kind}</td>
                  <td>{d.licenseClass ?? "—"}</td>
                  <td>{d.expiresAt ? d.expiresAt.toISOString().slice(0, 10) : "—"}</td>
                  <td>{d.uploadedAt.toISOString().slice(0, 10)}</td>
                  <td>{d.uploadedBy.email}</td>
                  <td>{d.verifiedAt ? "Verified" : "Self-reported"}</td>
                  <td className="admincreds__acts">
                    <form action={viewCredentialDocAsAdmin}>
                      <input type="hidden" name="docId" value={d.id} />
                      <button className="btn btn--ghost-ink" type="submit">View</button>
                    </form>
                    <form action={setCredentialVerified}>
                      <input type="hidden" name="docId" value={d.id} />
                      <input type="hidden" name="verify" value={d.verifiedAt ? "0" : "1"} />
                      <button className="btn btn--brass" type="submit">
                        {d.verifiedAt ? "Unverify" : "Verify"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Container>
    </main>
  );
}
