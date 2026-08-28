import { Container } from "@crewmarket/ui";
import { SignUpForm } from "../../components/auth-forms";

/* Accounts & Roles (SOW 2.i): CREW / BOAT account creation.
   D-2 checkbox placement lives in the form; footer carries the persistent copy. */

export const metadata = { title: "Create an account — Crew Market" };

export default async function SignUp({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  return (
    <main className="auth">
      <Container>
        <div className="auth__panel">
          <span className="eyebrow">CREW MARKET REGISTRY · NEW ACCOUNT</span>
          <h1 className="auth__title">Join the registry</h1>
          <p className="auth__lede">
            Crew offer services and set their own rates. Boats book them with payment held
            until the trip is done.
          </p>
          <SignUpForm initialRole={role} />
        </div>
      </Container>
    </main>
  );
}
