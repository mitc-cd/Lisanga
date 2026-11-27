import { headers } from "next/headers";
import { requireActor } from "@/server/auth/session";
import { listMySessions } from "@/server/users";
import { getAuth } from "@/server/auth/auth";
import { ORG_ROLE_LABELS } from "@/lib/permissions";
import { formatInstant } from "@/lib/dates";
import { Card } from "@/components/ui/misc";
import { ProfileForm, SignOutEverywhere } from "./profile-forms";

// mon code
export const metadata = { title: "Mon profil" };

function device(ua: string | null) {
  if (!ua) return "Appareil inconnu";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "Système inconnu";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  return `${br} sur ${os}`;
}

export default async function ProfilePage() {
  const actor = await requireActor();
  const auth = await getAuth();
  const [sessions, current] = await Promise.all([listMySessions(actor), auth.api.getSession({ headers: await headers() })]);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold">Mon profil</h1>
      <Card className="p-5">
        <ProfileForm name={actor.name} />
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Adresse e-mail</dt>
            <dd>{actor.email}</dd>
          </div>
          <div>
            <dt className="text-muted">Rôle dans l&apos;organisation</dt>
            <dd>{ORG_ROLE_LABELS[actor.orgRole]}</dd>
          </div>
          <div>
            <dt className="text-muted">Fuseau d&apos;affichage</dt>
            <dd>Africa/Kinshasa (heure de Kinshasa)</dd>
          </div>
        </dl>
      </Card>
      <Card>
        <h2 className="border-b border-border px-5 py-3 text-lg font-semibold">Sessions actives ({sessions.length})</h2>
        <ul className="divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.id} className="px-5 py-3 text-sm">
              <div className="font-medium">
                {device(s.userAgent)}
                {current?.session.token === s.token && <span className="ml-2 rounded bg-success-soft px-1.5 py-0.5 text-xs text-success">cet appareil</span>}
              </div>
              <div className="text-muted">
                Ouverte le {formatInstant(s.createdAt)} · dernière activité le {formatInstant(s.updatedAt)}
                {s.ipAddress && ` · ${s.ipAddress}`}
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-5 py-4">
          <SignOutEverywhere />
        </div>
      </Card>
    </div>
  );
}
