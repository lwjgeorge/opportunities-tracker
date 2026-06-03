import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  GOOGLE_OAUTH_STATE_COOKIE,
  buildAuthorizeUrl,
  buildRedirectUri,
  createSignedState,
  readOauthEnv,
} from "@/lib/oauth/google";

/**
 * Begin the Google OAuth handshake. Stamps a signed state cookie and 302s
 * to Google's consent screen.
 *
 * Sits OUTSIDE `(app)` deliberately — middleware exempts `/api/oauth/*` so
 * this is reachable without a Next-Auth session. CSRF is handled by the
 * signed state cookie checked in the callback.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  let env;
  try {
    env = readOauthEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth not configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const redirectUri = buildRedirectUri(origin);
  const state = createSignedState(env.authSecret);

  const authorizeUrl = buildAuthorizeUrl({
    clientId: env.clientId,
    redirectUri,
    state,
  });

  const jar = await cookies();
  jar.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax lets the cookie come back on Google's 302 to /callback (top-level
    // navigation). Strict would drop it.
    sameSite: "lax",
    path: "/",
    // OAuth handshakes don't take more than a few minutes. Short TTL limits
    // the window for an attacker to reuse a leaked state.
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(authorizeUrl);
}
