import Image from "next/image";
import { LogOut } from "lucide-react";
import { auth, signOut } from "@/auth";

export async function SidebarUser() {
  const session = await auth();
  const user = session?.user;

  const displayName = user?.name ?? "Signed in";
  const initial = displayName.charAt(0).toUpperCase() || "?";
  const image = user?.image ?? null;

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/sign-in" });
  }

  return (
    <div className="border-t border-border px-5 py-4">
      <div className="flex items-center gap-2.5">
        {image ? (
          <Image
            src={image}
            alt={displayName}
            width={28}
            height={28}
            className="h-7 w-7 rounded-full object-cover"
          />
        ) : (
          <div className="grid h-7 w-7 place-items-center rounded-full bg-surface-elevated text-xs font-medium text-foreground">
            {initial}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-xs font-medium text-foreground">
            {displayName}
          </span>
          <span className="text-[11px] text-foreground-subtle">
            Single-user mode
          </span>
        </div>
        <form action={handleSignOut}>
          <button
            type="submit"
            aria-label="Sign out"
            className="grid h-6 w-6 place-items-center rounded-md text-foreground-subtle transition-colors hover:bg-surface-elevated hover:text-foreground"
          >
            <LogOut size={13} strokeWidth={1.75} />
          </button>
        </form>
      </div>
    </div>
  );
}
