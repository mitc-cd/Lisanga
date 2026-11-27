"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { updateMyNameAction } from "@/app/actions/profile";
import { signOutEverywhereAction } from "@/app/actions/session";

export function ProfileForm({ name }: { name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const n = new FormData(e.currentTarget).get("name");
        start(async () => {
          const r = await updateMyNameAction(n);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Nom enregistré.");
          router.refresh();
        });
      }}
    >
      <div className="min-w-56 flex-1">
        <Label htmlFor="name">Nom affiché</Label>
        <Input id="name" name="name" defaultValue={name} required maxLength={100} />
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        Enregistrer
      </Button>
    </form>
  );
}

export function SignOutEverywhere() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Me déconnecter de tous mes appareils
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Se déconnecter partout ?"
        description="Toutes vos sessions, y compris celle-ci, seront fermées immédiatement. Vous devrez vous reconnecter sur chaque appareil."
        confirmLabel="Me déconnecter partout"
        danger
        onConfirm={() => void signOutEverywhereAction()}
      />
    </>
  );
}
