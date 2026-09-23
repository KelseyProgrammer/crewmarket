/* Pull the human message off an authClient.$fetch error. Our JSON routes answer
   4xx with a body `{ error }`; better-fetch spreads that body onto the error
   object (alongside status/statusText), so the server's copy lands on
   `error.error`. `message` is the transport fallback. Third duplicate of this
   helper — extracted here per the tokens.ts rule of three. */
export function serverError(error: unknown): string | null {
  if (error && typeof error === "object") {
    const e = error as { error?: unknown; message?: unknown };
    if (typeof e.error === "string" && e.error) return e.error;
    if (typeof e.message === "string" && e.message) return e.message;
  }
  return null;
}
