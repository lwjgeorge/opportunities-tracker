"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { emailAllowlist } from "@/db/schema";
import { parseAllowlistEntry } from "@/lib/email/allowlist-rules";

const PAGE_PATH = "/email-allowlist";

/**
 * Surface a server-action error via a redirect query param. We deliberately
 * avoid throwing — `next/navigation`'s `redirect` is the documented way to
 * stop a server action and bounce the user back with state. The error param
 * is URL-encoded by the caller; the page reads it and renders it.
 */
function errorRedirect(message: string): never {
  const url = `${PAGE_PATH}?error=${encodeURIComponent(message)}`;
  redirect(url);
}

/**
 * Postgres unique-violation SQLSTATE. We catch this so the user sees
 * "already in the allowlist" instead of a raw driver error.
 */
const PG_UNIQUE_VIOLATION = "23505";

function hasPostgresCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const candidate = err as { code?: unknown; cause?: { code?: unknown } };
  if (candidate.code === code) return true;
  if (candidate.cause && candidate.cause.code === code) return true;
  return false;
}

export async function addAllowlistEntry(formData: FormData): Promise<void> {
  const raw = {
    kind: formData.get("kind"),
    value: formData.get("value"),
    notes: formData.get("notes"),
  };

  const parsed = parseAllowlistEntry(raw);
  if (!parsed.ok) {
    errorRedirect(parsed.error);
  }

  try {
    await db.insert(emailAllowlist).values({
      kind: parsed.value.kind,
      value: parsed.value.value,
      notes: parsed.value.notes,
    });
  } catch (err) {
    if (hasPostgresCode(err, PG_UNIQUE_VIOLATION)) {
      errorRedirect(
        `'${parsed.value.value}' is already in the allowlist`,
      );
    }
    const message = err instanceof Error ? err.message : "Database error";
    errorRedirect(message);
  }

  revalidatePath(PAGE_PATH);
  // Bounce to clean URL so a refresh doesn't repost the form or carry a
  // stale ?error from a previous failed attempt.
  redirect(PAGE_PATH);
}

export async function deleteAllowlistEntry(formData: FormData): Promise<void> {
  const rawId = formData.get("id");
  const id = typeof rawId === "string" ? Number.parseInt(rawId, 10) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    errorRedirect("Invalid entry id");
  }

  await db.delete(emailAllowlist).where(eq(emailAllowlist.id, id));
  revalidatePath(PAGE_PATH);
}
