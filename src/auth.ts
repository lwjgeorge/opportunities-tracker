import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Single-user gate.
 *
 * Auth.js v5 picks up `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` / `AUTH_SECRET`
 * from the environment automatically, so we do not pass them to the provider
 * explicitly. The `ALLOWED_GITHUB_ID` env var is the only account allowed
 * past `signIn` — every other GitHub user is rejected by returning `false`.
 *
 * GitHub returns `profile.id` as a `number`, but env vars are strings, so we
 * stringify and compare to avoid a `1 !== "1"` foot-gun.
 */
const authConfig: NextAuthConfig = {
  providers: [GitHub],
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
  trustHost: true,
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider !== "github") return false;
      const allowed = process.env.ALLOWED_GITHUB_ID;
      if (!allowed) return false;
      const githubId = profile?.id;
      if (githubId === undefined || githubId === null) return false;
      return String(githubId) === String(allowed);
    },
    jwt({ token, profile }) {
      // Persist the GitHub avatar + login on first sign-in so the session
      // can render the sidebar without an extra API call.
      if (profile) {
        token.picture =
          typeof profile.avatar_url === "string"
            ? profile.avatar_url
            : token.picture;
        token.name =
          typeof profile.name === "string" && profile.name.length > 0
            ? profile.name
            : typeof profile.login === "string"
              ? profile.login
              : token.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (typeof token.picture === "string") session.user.image = token.picture;
        if (typeof token.name === "string") session.user.name = token.name;
      }
      return session;
    },
  },
};

export const { auth, signIn, signOut, handlers } = NextAuth(authConfig);
