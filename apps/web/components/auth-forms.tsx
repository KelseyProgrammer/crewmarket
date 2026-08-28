"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../lib/auth-client";

/* Signup fork mirrors the landing fork (docs/DESIGN.md R5): the two real intents,
   concrete verbs, marketplace vocabulary only (M-1). */
const ACCOUNT_OPTIONS = [
  {
    value: "CREW",
    label: "Crew",
    desc: "List your services and set your own rates. Accept or decline any booking — no penalties.",
  },
  {
    value: "BOAT",
    label: "Boat",
    desc: "Book credentialed crew. Payment is held until the trip is done and reviewed.",
  },
] as const;

export function SignUpForm({ initialRole }: { initialRole?: string }) {
  const router = useRouter();
  const [role, setRole] = useState(initialRole === "BOAT" ? "BOAT" : "CREW");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const { error: err } = await authClient.signUp.email({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      accountType: role,
      // Only ever true here: the required checkbox below gates submission (D-2).
      disclaimerAccepted: form.get("disclaimer") === "on",
    });
    if (err) {
      setError(err.message ?? "Could not create the account. Check the fields and try again.");
      setPending(false);
      return;
    }
    router.push("/account");
    router.refresh();
  }

  return (
    <form className="auth__form" onSubmit={onSubmit}>
      <fieldset className="role-fork">
        <legend className="field__label">Account type</legend>
        {ACCOUNT_OPTIONS.map((opt) => (
          <label key={opt.value} className={`role-fork__plate${role === opt.value ? " role-fork__plate--active" : ""}`}>
            <input
              type="radio"
              name="accountType"
              value={opt.value}
              checked={role === opt.value}
              onChange={() => setRole(opt.value)}
            />
            <span className="role-fork__name">{opt.label}</span>
            <span className="role-fork__desc">{opt.desc}</span>
          </label>
        ))}
      </fieldset>

      <label className="field">
        <span className="field__label">{role === "CREW" ? "Name as listed" : "Your name"}</span>
        <input name="name" type="text" autoComplete="name" required disabled={pending} />
      </label>
      <label className="field">
        <span className="field__label">Email</span>
        <input name="email" type="email" autoComplete="email" required disabled={pending} />
      </label>
      <label className="field">
        <span className="field__label">Password</span>
        <input name="password" type="password" autoComplete="new-password" minLength={8} required disabled={pending} />
        <span className="field__hint">At least 8 characters.</span>
      </label>

      {/* Rule D-2: signup checkbox placement — the disclaimer text is verbatim and required to proceed. */}
      <label className="auth__disclaimer">
        <input type="checkbox" name="disclaimer" required disabled={pending} />
        <span>
          I understand the following: Crew Market is a directory and booking marketplace.
          {" "}We are not an employer, crewing agency, or vessel operator.
          {" "}Vessel owners are solely responsible for crew selection, vessel operation, and
          legal compliance including insurance.
        </span>
      </label>

      {error && (
        <p className="auth__error" role="alert">
          <span className="auth__error-label">Could not continue</span>
          {error}
        </p>
      )}

      <button className="btn btn--brass auth__submit" type="submit" disabled={pending}>
        {pending ? "Creating account…" : role === "CREW" ? "Create account & offer services" : "Create account & book crew"}
      </button>
      <p className="auth__alt">
        Already on the registry? <a href="/sign-in">Sign in</a>
      </p>
    </form>
  );
}

export function SignInForm({ from }: { from?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const { error: err } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (err) {
      setError(
        err.status === 401
          ? "That email and password don't match a registry account."
          : err.message ?? "Could not sign in. Try again.",
      );
      setPending(false);
      return;
    }
    router.push(from && from.startsWith("/") ? from : "/account");
    router.refresh();
  }

  return (
    <form className="auth__form" onSubmit={onSubmit}>
      <label className="field">
        <span className="field__label">Email</span>
        <input name="email" type="email" autoComplete="email" required disabled={pending} />
      </label>
      <label className="field">
        <span className="field__label">Password</span>
        <input name="password" type="password" autoComplete="current-password" required disabled={pending} />
      </label>

      {error && (
        <p className="auth__error" role="alert">
          <span className="auth__error-label">Could not continue</span>
          {error}
        </p>
      )}

      <button className="btn btn--brass auth__submit" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="auth__alt">
        New here? <a href="/sign-up">Create an account</a>
      </p>
    </form>
  );
}
