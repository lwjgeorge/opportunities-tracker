import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

interface SignInPageProps {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  if (session?.user) {
    redirect("/applications");
  }

  const { error } = await searchParams;
  const hasError = typeof error === "string" && error.length > 0;

  async function handleSignIn() {
    "use server";
    await signIn("github", { redirectTo: "/applications" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface px-6 py-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-accent/15 text-accent">
            <span className="text-xs font-semibold">OT</span>
          </div>
          <h1 className="text-sm font-semibold text-foreground">
            Opportunities Tracker
          </h1>
          <p className="text-[11px] text-foreground-subtle">
            Single-user mode. Sign in to continue.
          </p>
        </div>

        <form action={handleSignIn}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface-elevated px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated/70"
          >
            <GithubMark />
            Sign in with GitHub
          </button>
        </form>

        {hasError ? (
          <p className="mt-4 text-center text-[11px] text-red-400">
            Access denied — this is a single-user app.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function GithubMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M12 .5C5.73.5.78 5.45.78 11.72c0 4.97 3.22 9.18 7.69 10.67.56.1.77-.24.77-.54 0-.27-.01-1.16-.02-2.1-3.13.68-3.79-1.34-3.79-1.34-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.7-1.5-2.5-.29-5.13-1.25-5.13-5.55 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15.9-.25 1.86-.37 2.82-.37s1.92.12 2.82.37c2.14-1.45 3.09-1.15 3.09-1.15.62 1.55.23 2.69.11 2.98.73.79 1.16 1.79 1.16 3.02 0 4.31-2.64 5.25-5.15 5.53.4.34.76 1.02.76 2.06 0 1.49-.01 2.69-.01 3.06 0 .3.2.65.78.54 4.46-1.49 7.68-5.71 7.68-10.67C23.22 5.45 18.27.5 12 .5z" />
    </svg>
  );
}
