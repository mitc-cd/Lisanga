import { redirect } from "next/navigation";
import { hasAdmin } from "@/server/setup";
import { getActor } from "@/server/auth/session";

export default async function Home() {
  if (!(await hasAdmin())) redirect("/installation");
  redirect((await getActor()) ? "/mes-taches" : "/connexion");
}
