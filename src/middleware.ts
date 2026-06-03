import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Single-user gate. Everything except the sign-in page, the Auth.js handler
 * routes, the cron endpoints (auth'd via CRON_SECRET header by the worker
 * agents), and Next internals requires a session.
 *
 * The `config.matcher` below excludes Next internals + static files at the
 * routing layer so this function does not run for every asset request.
 */
export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  const isPublic =
    pathname === "/sign-in" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron");

  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    const signInUrl = new URL("/sign-in", nextUrl);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Exclude Next internals and common static asset extensions so the
  // middleware only runs for actual page/route navigations.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
