import { requireActor } from "@/server/auth/session";
import { listDirectory, listTeams } from "@/server/users";
import { TeamsAdmin } from "./teams-admin";

export const metadata = { title: "Équipes" };

export default async function TeamsPage() {
  const actor = await requireActor();
  const [teams, people] = await Promise.all([listTeams(actor), listDirectory(actor)]);
  return <TeamsAdmin teams={teams} people={people.map((p) => ({ id: p.id, name: p.name }))} />;
}
