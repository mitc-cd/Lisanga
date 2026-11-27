import { requireActor } from "@/server/auth/session";
import { listInbox } from "@/server/notifications";
import { InboxView } from "./inbox-view";

export const metadata = { title: "Boîte de réception" };

export default async function InboxPage() {
  const actor = await requireActor();
  const initial = await listInbox(actor);
  return <InboxView initial={initial} />;
}
