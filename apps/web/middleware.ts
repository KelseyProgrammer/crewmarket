import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/* Optimistic gate only (cookie presence); /account does the real session check
   server-side. Directory and landing stay public — browsing is never gated. */
export function middleware(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/account/:path*", "/account"],
};
