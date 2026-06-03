import { redirect } from "next/navigation";

/**
 * Until a richer relationships overview exists, the section root just bounces
 * to the candidates queue — that's where the user spends their review time.
 */
export default function RelationshipsIndexPage(): never {
  redirect("/relationships/candidates");
}
