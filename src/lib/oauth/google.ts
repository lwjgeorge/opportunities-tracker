import crypto from "node:crypto";

/**
 * Shared helpers for the Google OAuth handshake (Gmail readonly today).
 *
 * The "secret" used to sign the state cookie is `AUTH_SECRET` — already
 * required by Auth.js for session signing. Reusing it means we don't add a
 * new env var for what is functionally the same trust boundary (this
 * application's server). If Auth.js ever rotates AUTH_SECRET the in-flight
 * OAuth flow becomes invalid, which is the right behaviour.
 */

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_OAUTH_AUTH_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_OAUTH_USERINFO_URL =
  "https://www.googleapis.com/oauth2/v2/userinfo";

/**
 * Scopes Gmail needs. Read-only is sufficient for the polling cron — we never
 * send mail. Adding any new scope here forces re-consent via prompt=consent.
 */
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  // Needed to know whose account this is (account_email column).
  "https://www.googleapis.com/auth/userinfo.email",
];

export const GOOGLE_PROVIDER_KEY = "google";

type RequiredOauthEnv = {
  clientId: string;
  clientSecret: string;
  authSecret: string;
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export function readOauthEnv(): RequiredOauthEnv {
  return {
    clientId: requiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    authSecret: requiredEnv("AUTH_SECRET"),
  };
}

/**
 * The redirect_uri MUST match exactly what's registered in the Google Cloud
 * console. We derive it from the request origin so dev (localhost) and prod
 * (Vercel) both work without an env var. The user is told (in the Setup
 * checklist) to register BOTH URIs in the Google console.
 */
export function buildRedirectUri(origin: string): string {
  return `${origin}/api/oauth/google/callback`;
}

/**
 * State value format: `<nonce>.<hmac>` where hmac = HMAC-SHA256(authSecret, nonce).
 *
 * The nonce alone would be a perfectly fine CSRF token IF we trusted the
 * cookie store. We do (httpOnly + sameSite=lax), but signing the value lets
 * the callback short-circuit on a tampered cookie without a DB hop.
 */
export function createSignedState(authSecret: string): string {
  const nonce = crypto.randomBytes(24).toString("base64url");
  const sig = signNonce(authSecret, nonce);
  return `${nonce}.${sig}`;
}

export function verifySignedState(
  authSecret: string,
  state: string | null | undefined,
): boolean {
  if (!state || typeof state !== "string") return false;
  const idx = state.indexOf(".");
  if (idx <= 0 || idx === state.length - 1) return false;
  const nonce = state.slice(0, idx);
  const sig = state.slice(idx + 1);
  const expected = signNonce(authSecret, nonce);
  // Timing-safe compare; lengths can differ if state was truncated.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function signNonce(secret: string, nonce: string): string {
  return crypto.createHmac("sha256", secret).update(nonce).digest("base64url");
}

type AuthorizeUrlInput = {
  clientId: string;
  redirectUri: string;
  state: string;
};

export function buildAuthorizeUrl({
  clientId,
  redirectUri,
  state,
}: AuthorizeUrlInput): string {
  const url = new URL(GOOGLE_OAUTH_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  // access_type=offline + prompt=consent guarantees a refresh_token in the
  // token response (Google only emits refresh tokens on first consent OR
  // when you explicitly re-prompt).
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenExchangeResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

/**
 * Exchange an auth code for tokens. Uses fetch instead of `googleapis` to
 * keep this dependency-free and trivially testable.
 */
export async function exchangeCodeForTokens(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<TokenExchangeResponse> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenExchangeResponse;
}

type UserInfoResponse = {
  email?: string;
  verified_email?: boolean;
};

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(GOOGLE_OAUTH_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as UserInfoResponse;
  return typeof data.email === "string" ? data.email.toLowerCase() : null;
}
