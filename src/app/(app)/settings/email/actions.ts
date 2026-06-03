"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { oauthTokens } from "@/db/oauth-schema";

/**
 * Drop a stored OAuth credential. Sole side-effect: after this runs the
 * Gmail cron will fail at next tick unless the user reconnects or sets
 * GOOGLE_REFRESH_TOKEN in env (the documented fallback).
 *
 * We don't try to revoke the token at Google — the row going away is enough
 * to stop polling. The user can revoke at https://myaccount.google.com if
 * they want full revocation.
 */
export async function disconnectGoogle(formData: FormData): Promise<void> {
  const rawId = formData.get("id");
  const id = typeof rawId === "string" ? Number.parseInt(rawId, 10) : NaN;
  if (!Number.isFinite(id) || id <= 0) return;

  await db.delete(oauthTokens).where(eq(oauthTokens.id, id));
  revalidatePath("/settings/email");
  revalidatePath("/settings");
}
