import { Container } from "@crewmarket/ui";
import { SignInForm } from "../../components/auth-forms";

export const metadata = { title: "Sign in — Crew Market" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return (
    <main className="auth">
      <Container>
        <div className="auth__panel">
          <span className="eyebrow">CREW MARKET REGISTRY · SIGN IN</span>
          <h1 className="auth__title">Welcome back</h1>
          <SignInForm from={from} />
        </div>
      </Container>
    </main>
  );
}
