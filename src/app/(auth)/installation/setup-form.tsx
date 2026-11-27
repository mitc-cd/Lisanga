"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { completeSetupAction } from "./actions";

export function SetupForm({ initialToken }: { initialToken: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await completeSetupAction(Object.fromEntries(fd));
          if (!r.ok) return setError(r.error);
          router.replace("/admin/parametres?etape=smtp");
          router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor="token">Jeton d&apos;installation</Label>
        <Input id="token" name="token" required defaultValue={initialToken} autoComplete="off" spellCheck={false} />
      </div>
      <div>
        <Label htmlFor="organizationName">Nom de l&apos;organisation</Label>
        <Input id="organizationName" name="organizationName" required defaultValue="MiTC" />
      </div>
      <div>
        <Label htmlFor="name">Votre nom</Label>
        <Input id="name" name="name" required autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="email">Votre adresse e-mail professionnelle</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Création…" : "Créer le compte administrateur"}
      </Button>
      <p className="text-xs text-muted">Étape suivante : configuration de l&apos;envoi d&apos;e-mails (SMTP), nécessaire pour inviter des collègues.</p>
    </form>
  );
}
