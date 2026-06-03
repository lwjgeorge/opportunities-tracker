import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { oauthTokens } from "@/db/oauth-schema";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_PROVIDER_KEY,
  buildRedirectUri,
  exchangeCodeForTokens,
  fetchUserEmail,
  readOauthEnv,
  verifySignedState,
} from "@/lib/oauth/google";

/**
 * Callback for the Google OAuth handshake. Verifies state, exchanges the
 * code for tokens, learns the account email, and upserts the credential.
 *
 * On success: 302 to /settings/email?connected=1.
 * On failure: 302 to /settings/email?error=<urlencoded message>. We never
 * dump the raw provider error JSON into the URL — it can be hundreds of
 * characters and exposes internals.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_PATH = "/settings/email";

function errorRedirect(origin: string, message: string): NextResponse {
  const url = new URL(SETTINGS_PATH, origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const origin = url.origin;

  // Google may bounce back with `error=access_denied` if the user cancels.
  const googleError = url.searchParams.get("error");
  if (googleError) {
    return errorRedirect(origin, `Google: ${googleError}`);
  }

  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  if (!code || !stateParam) {
    return errorRedirect(origin, "Missing code or state");
  }

  let env;
  try {
    env = readOauthEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth not configured";
    return errorRedirect(origin, message);
  }

  const jar = await cookies();
  const stateCookie = jar.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  // Clear it whether or not it matches — single-use semantics.
  jar.delete(GOOGLE_OAUTH_STATE_COOKIE);

  if (!stateCookie || stateCookie !== stateParam) {
    return errorRedirect(origin, "State mismatch (CSRF check failed)");
  }
  if (!verifySignedState(env.authSecret, stateCookie)) {
    return errorRedirect(origin, "State signature invalid");
  }

  const redirectUri = buildRedirectUri(origin);

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      code,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      redirectUri,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed";
    return errorRedirect(origin, message);
  }

  if (!tokens.refresh_token) {
    // Google only returns a refresh_token when prompt=consent (we set that)
    // OR on the very first authorise of this client+account. If we somehow
    // got here without one, we cannot poll — surface a clear error.
    return errorRedirect(
      origin,
      "No refresh token returned. Revoke this app's access in your Google account and try again.",
    );
  }

  const accountEmail = await fetchUserEmail(tokens.access_token).catch(
    () => null,
  );

  const expiresAt =
    typeof tokens.expires_in === "number"
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

  try {
    // Upsert on (provider, account_email). If accountEmail is null the
    // unique index treats nulls as distinct in Postgres — that is the
    // documented behaviour and is fine for the single-user case: a row
    // with NULL email gets a separate slot.
    await db
      .insert(oauthTokens)
      .values({
        provider: GOOGLE_PROVIDER_KEY,
        accountEmail,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        expiresAt,
        scopes: tokens.scope ?? null,
      })
      .onConflictDoUpdate({
        target: [oauthTokens.provider, oauthTokens.accountEmail],
        set: {
          refreshToken: tokens.refresh_token,
          accessToken: tokens.access_token,
          expiresAt,
          scopes: tokens.scope ?? null,
          updatedAt: sql`now()`,
        },
      });
  } catch (err) {
    const message = err instanceof Error ? err.message : "DB write failed";
    return errorRedirect(origin, message);
  }

  const success = new URL(SETTINGS_PATH, origin);
  success.searchParams.set("connected", "1");
  return NextResponse.redirect(success);
}
