import { redirect } from "next/navigation";

// Round 4 pivot: graph is the headline. Applications is still there, just no
// longer the landing route.
export default function Home() {
  redirect("/graph");
}
