"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { requestLoginAction } from "./actions";

export function EmailForm({ defaultEmail }: { defaultEmail: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get("email") ?? "");
        setError(null);
        start(async () => {
          const r = await requestLoginAction(email);
          if (!r.ok) return setError(r.error);
          router.push(`/connexion/code?email=${encodeURIComponent(r.data.email)}`);
        });
      }}
    >
      <div>
        <Label htmlFor="email">Adresse e-mail professionnelle</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" autoFocus defaultValue={defaultEmail} placeholder="prenom.nom@mitc.cd" />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Envoi…" : "Recevoir un lien et un code"}
      </Button>
    </form>
  );
}

export function MicrosoftButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        className="w-full"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const res = await fetch("/api/auth/sign-in/social", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ provider: "microsoft", callbackURL: "/mes-taches", errorCallbackURL: "/connexion?erreur=microsoft" }),
            });
            const body = await res.json();
            if (!res.ok || !body.url) throw new Error();
            window.location.href = body.url;
          } catch {
            setPending(false);
            setError("Impossible de démarrer la connexion Microsoft. Réessayez ou utilisez la connexion par e-mail.");
          }
        }}
      >
        <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden>
          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
        </svg>
        Se connecter avec Microsoft
      </Button>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
