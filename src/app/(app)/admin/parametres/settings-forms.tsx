"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import { Alert, Card } from "@/components/ui/misc";
import { formatInstant } from "@/lib/dates";
import { contrastRatio } from "@/lib/colors";
import type { AdminSettingsView } from "@/lib/validation/settings";
import type { ActionResult } from "@/lib/errors";
import {
  saveBrandingAction,
  saveEntraAction,
  saveLoginSettingsAction,
  saveSmtpAction,
  sendSmtpTestAction,
  testEntraAction,
} from "../actions";

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6">
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
        <div className="mt-5">{children}</div>
      </section>
    </Card>
  );
}

function useSubmit() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submit = <T,>(fn: () => Promise<ActionResult<T>>, success: string, onOk?: (d: T) => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(success);
      onOk?.(r.data);
      router.refresh();
    });
  };
  return { pending, error, submit, setError };
}

export function SettingsForms({
  settings,
  redirectUri,
  adminEmail,
  onboarding,
}: {
  settings: AdminSettingsView;
  redirectUri: string;
  adminEmail: string;
  onboarding: boolean;
}) {
  return (
    <div className="space-y-6">
      {onboarding && (
        <Alert tone="info">
          <strong>Bienvenue !</strong> Dernière étape de l&apos;installation : configurez l&apos;envoi d&apos;e-mails ci-dessous. Il est
          nécessaire pour les codes de connexion et les invitations.
        </Alert>
      )}
      <SmtpForm s={settings} adminEmail={adminEmail} />
      <LoginForm s={settings} />
      <EntraForm s={settings} redirectUri={redirectUri} />
      <BrandingForm s={settings} />
    </div>
  );
}

function SmtpForm({ s, adminEmail }: { s: AdminSettingsView; adminEmail: string }) {
  const { pending, error, submit } = useSubmit();
  const test = useSubmit();
  const [replacePwd, setReplacePwd] = useState(!s.smtp.passwordSet);
  const [security, setSecurity] = useState(s.smtp.security);
  const [port, setPort] = useState(String(s.smtp.port));
  return (
    <Section
      id="smtp"
      title="Envoi d'e-mails (SMTP)"
      description="Utilisé pour les codes de connexion et les invitations. Fonctionne avec tout serveur SMTP (serveur MiTC, Microsoft 365, Brevo…)."
    >
      <div className="mb-4">
        {s.smtp.status === "ok" && (
          <Alert tone="success">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} aria-hidden /> Configuration active et fonctionnelle
              {s.smtp.lastSuccessAt && ` (dernier envoi réussi le ${formatInstant(s.smtp.lastSuccessAt)})`}.
            </span>
          </Alert>
        )}
        {s.smtp.status === "failing" && (
          <Alert tone="warning">
            <span className="inline-flex items-start gap-2">
              <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                <strong>Le dernier envoi a échoué</strong>
                {s.smtp.lastFailureAt && ` (${formatInstant(s.smtp.lastFailureAt)})`} : {s.smtp.lastError}
              </span>
            </span>
          </Alert>
        )}
        {s.smtp.status === "unconfigured" && <Alert tone="info">Aucune configuration active pour l&apos;instant.</Alert>}
      </div>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const v = Object.fromEntries(fd) as Record<string, string>;
          submit(
            () => saveSmtpAction({ ...v, newPassword: replacePwd ? v.newPassword : undefined }),
            "E-mail de test envoyé : configuration enregistrée et activée.",
            () => setReplacePwd(false),
          );
        }}
      >
        <div className="sm:col-span-2">
          <Label htmlFor="smtp-host">Hôte</Label>
          <Input id="smtp-host" name="host" defaultValue={s.smtp.host} placeholder="smtp.mitc.cd" required />
        </div>
        <div>
          <Label htmlFor="smtp-security">Chiffrement</Label>
          <Select
            id="smtp-security"
            name="security"
            value={security}
            onChange={(e) => {
              const v = e.target.value as typeof security;
              setSecurity(v);
              setPort(v === "tls" ? "465" : v === "starttls" ? "587" : port);
            }}
          >
            <option value="starttls">STARTTLS (port 587, recommandé)</option>
            <option value="tls">SSL/TLS (port 465)</option>
            <option value="none">Aucun (réseau interne uniquement)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="smtp-port">Port</Label>
          <Input id="smtp-port" name="port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="smtp-user">Identifiant</Label>
          <Input id="smtp-user" name="user" defaultValue={s.smtp.user} autoComplete="off" />
          <FieldHint>Laisser vide si le serveur n&apos;exige pas d&apos;authentification.</FieldHint>
        </div>
        <div>
          <Label htmlFor="smtp-password">Mot de passe</Label>
          {replacePwd ? (
            <Input id="smtp-password" name="newPassword" type="password" autoComplete="new-password" />
          ) : (
            <div className="flex h-10 items-center gap-3">
              <span className="text-sm text-muted" id="smtp-password">
                •••• configuré
              </span>
              <Button variant="secondary" size="sm" onClick={() => setReplacePwd(true)}>
                Remplacer
              </Button>
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="smtp-from">Adresse d&apos;expéditeur</Label>
          <Input id="smtp-from" name="fromEmail" type="email" defaultValue={s.smtp.fromEmail} placeholder="projets@mitc.cd" required />
        </div>
        <div>
          <Label htmlFor="smtp-from-name">Nom d&apos;expéditeur</Label>
          <Input id="smtp-from-name" name="fromName" defaultValue={s.smtp.fromName || "MiTC Projets"} />
        </div>
        <div>
          <Label htmlFor="smtp-reply">Adresse de réponse (facultatif)</Label>
          <Input id="smtp-reply" name="replyTo" type="email" defaultValue={s.smtp.replyTo} />
        </div>
        <div>
          <Label htmlFor="smtp-test-to">Envoyer l&apos;e-mail de test à</Label>
          <Input id="smtp-test-to" name="testRecipient" type="email" defaultValue={adminEmail} required />
        </div>
        {error && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{error} La configuration active n&apos;a pas été modifiée.</Alert>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Envoi de l'e-mail de test…" : "Envoyer un e-mail de test et activer"}
          </Button>
          {s.smtp.status !== "unconfigured" && (
            <Button
              variant="secondary"
              disabled={test.pending}
              onClick={() => test.submit(() => sendSmtpTestAction(adminEmail), `E-mail de test envoyé à ${adminEmail}.`)}
            >
              {test.pending ? "Envoi…" : "Tester la configuration active"}
            </Button>
          )}
          <span className="text-xs text-muted">La configuration n&apos;est enregistrée que si l&apos;e-mail de test part avec succès.</span>
        </div>
        {test.error && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{test.error}</Alert>
          </div>
        )}
      </form>
    </Section>
  );
}

function LoginForm({ s }: { s: AdminSettingsView }) {
  const { pending, error, submit } = useSubmit();
  return (
    <Section id="connexion" title="Connexion" description="Connexion sans mot de passe par e-mail (lien et code à 6 chiffres) et règles d'admission.">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          submit(
            () =>
              saveLoginSettingsAction({
                emailLoginEnabled: fd.get("emailLoginEnabled") === "on",
                codeTtlMinutes: fd.get("codeTtlMinutes"),
                sessionDays: fd.get("sessionDays"),
                autoAdmitDomains: String(fd.get("autoAdmitDomains") ?? "")
                  .split(/[\s,;]+/)
                  .map((d) => d.trim().replace(/^@/, ""))
                  .filter(Boolean),
              }),
            "Paramètres de connexion enregistrés.",
          );
        }}
      >
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="emailLoginEnabled" defaultChecked={s.emailLoginEnabled} className="h-4 w-4" />
          Autoriser la connexion par e-mail (lien et code)
        </label>
        <div>
          <Label htmlFor="ttl">Validité du lien et du code (minutes)</Label>
          <Input id="ttl" name="codeTtlMinutes" type="number" min={5} max={30} defaultValue={s.codeTtlMinutes} />
        </div>
        <div>
          <Label htmlFor="days">Durée des sessions (jours, glissante)</Label>
          <Input id="days" name="sessionDays" type="number" min={1} max={90} defaultValue={s.sessionDays} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="domains">Domaines admis automatiquement</Label>
          <Input id="domains" name="autoAdmitDomains" defaultValue={s.autoAdmitDomains.join(", ")} placeholder="mitc.cd" aria-describedby="domains-hint" />
          <FieldHint id="domains-hint">
            Toute adresse de ces domaines peut se connecter sans invitation (rôle « membre »). Laisser vide : accès sur invitation uniquement.
          </FieldHint>
        </div>
        {error && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Section>
  );
}

function EntraForm({ s, redirectUri }: { s: AdminSettingsView; redirectUri: string }) {
  const { pending, error, submit } = useSubmit();
  const test = useSubmit();
  const [replace, setReplace] = useState(!s.entra.secretSet);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <Section
      id="entra"
      title="Microsoft Entra ID"
      description="Facultatif. Ajoute le bouton « Se connecter avec Microsoft », limité au tenant MiTC. Étapes : enregistrer, tester, puis activer."
    >
      <div className="mb-4 space-y-2 text-sm">
        <Label htmlFor="redirect">URL de redirection à déclarer dans Entra ID (plateforme « Web »)</Label>
        <div className="flex gap-2">
          <Input id="redirect" readOnly value={redirectUri} className="font-mono text-xs" />
          <Button
            variant="secondary"
            aria-label="Copier l'URL de redirection"
            onClick={() => navigator.clipboard.writeText(redirectUri).then(() => toast.success("URL copiée."))}
          >
            <Copy size={16} aria-hidden /> Copier
          </Button>
        </div>
      </div>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          submit(
            () =>
              saveEntraAction({
                tenantId: String(fd.get("tenantId") ?? "").trim(),
                clientId: String(fd.get("clientId") ?? "").trim(),
                newSecret: replace ? String(fd.get("newSecret") ?? "") || undefined : undefined,
                enabled: fd.get("enabled") === "on",
              }),
            "Paramètres Microsoft Entra ID enregistrés.",
            () => setReplace(false),
          );
        }}
      >
        <div>
          <Label htmlFor="tenant">Identifiant du tenant (Directory ID)</Label>
          <Input id="tenant" name="tenantId" defaultValue={s.entra.tenantId} placeholder="00000000-0000-0000-0000-000000000000" className="font-mono text-xs" />
        </div>
        <div>
          <Label htmlFor="client">Identifiant de l&apos;application (Client ID)</Label>
          <Input id="client" name="clientId" defaultValue={s.entra.clientId} placeholder="00000000-0000-0000-0000-000000000000" className="font-mono text-xs" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="secret">Secret client</Label>
          {replace ? (
            <Input id="secret" name="newSecret" type="password" autoComplete="new-password" />
          ) : (
            <div className="flex h-10 items-center gap-3">
              <span className="text-sm text-muted" id="secret">
                •••• configuré
              </span>
              <Button variant="secondary" size="sm" onClick={() => setReplace(true)}>
                Remplacer
              </Button>
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="enabled" defaultChecked={s.entra.enabled} className="h-4 w-4" />
          Activer « Se connecter avec Microsoft »
          {s.entra.lastTestOk !== true && <span className="text-xs text-muted">(nécessite un test réussi)</span>}
        </label>
        {error && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        {testMsg && (
          <div className="sm:col-span-2">
            <Alert tone={testMsg.ok ? "success" : "danger"}>{testMsg.message}</Alert>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            Enregistrer
          </Button>
          <Button
            variant="secondary"
            disabled={test.pending || !s.entra.tenantId || !s.entra.clientId || !s.entra.secretSet}
            onClick={() =>
              test.submit(
                () => testEntraAction(),
                "Test terminé.",
                (d) => setTestMsg(d as { ok: boolean; message: string }),
              )
            }
          >
            {test.pending ? "Test…" : "Tester la connexion"}
          </Button>
          {s.entra.lastTestAt && (
            <span className="text-xs text-muted">
              Dernier test : {formatInstant(s.entra.lastTestAt)} — {s.entra.lastTestOk ? "réussi" : "échec"}
            </span>
          )}
        </div>
        {test.error && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{test.error}</Alert>
          </div>
        )}
      </form>
    </Section>
  );
}

function BrandingForm({ s }: { s: AdminSettingsView }) {
  const { pending, error, submit } = useSubmit();
  const [primary, setPrimary] = useState(s.primaryColor);
  const ratio = /^#[0-9a-fA-F]{6}$/.test(primary) ? contrastRatio(primary, "#ffffff") : 0;
  return (
    <Section id="identite" title="Identité visuelle" description="Nom de l'application et couleurs. Le logo MiTC est servi par l'application (public/brand).">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          submit(() => saveBrandingAction(Object.fromEntries(fd)), "Identité visuelle enregistrée.");
        }}
      >
        <div className="sm:col-span-2">
          <Label htmlFor="appName">Nom de l&apos;application</Label>
          <Input id="appName" name="appName" defaultValue={s.appName} required />
        </div>
        <ColorField id="primaryColor" label="Couleur primaire" value={primary} onChange={setPrimary} />
        <ColorField id="secondaryColor" label="Couleur secondaire" defaultValue={s.secondaryColor} />
        <ColorField id="accentColor" label="Couleur d'accent" defaultValue={s.accentColor} />
        <div className="text-sm sm:col-span-2">
          {ratio > 0 && ratio < 4.5 ? (
            <Alert tone="warning">
              Contraste du texte blanc sur la couleur primaire : {ratio.toFixed(1)}:1 (minimum 4,5:1). Le texte des boutons passera automatiquement en
              foncé.
            </Alert>
          ) : (
            ratio > 0 && <p className="text-xs text-muted">Contraste du texte blanc sur la couleur primaire : {ratio.toFixed(1)}:1 (conforme).</p>
          )}
        </div>
        {error && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Section>
  );
}

function ColorField({ id, label, defaultValue, value, onChange }: { id: string; label: string; defaultValue?: string; value?: string; onChange?: (v: string) => void }) {
  const [v, setV] = useState(value ?? defaultValue ?? "#000000");
  const current = value ?? v;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (sélecteur)`}
          value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : "#000000"}
          onChange={(e) => (onChange ? onChange(e.target.value) : setV(e.target.value))}
          className="h-10 w-12 cursor-pointer rounded border border-border-strong bg-surface"
        />
        <Input id={id} name={id} value={current} onChange={(e) => (onChange ? onChange(e.target.value) : setV(e.target.value))} className="font-mono" />
      </div>
    </div>
  );
}
