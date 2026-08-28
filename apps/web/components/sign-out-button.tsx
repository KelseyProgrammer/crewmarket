"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      className="btn btn--ghost-ink"
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut({});
        router.push("/");
        router.refresh();
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
