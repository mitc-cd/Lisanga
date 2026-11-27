import { requireActor } from "@/server/auth/session";
import { listOrgUsers } from "@/server/users";
import { MembersAdmin } from "./members-admin";

export const metadata = { title: "Membres" };

export default async function MembersPage() {
  const actor = await requireActor();
  const users = await listOrgUsers(actor);
  return <MembersAdmin users={users} selfId={actor.id} />;
}
