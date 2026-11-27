import { expect, type Page } from "@playwright/test";

const MAILPIT = "http://localhost:18025/api/v1";

type MailSummary = { ID: string; Subject: string; Created: string };

/** Attend le dernier e-mail reçu par une adresse (optionnellement filtré par objet) et renvoie son texte. */
export async function waitForMail(to: string, subjectIncludes?: string, after?: Date): Promise<{ subject: string; text: string }> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const body = (await res.json()) as { messages: MailSummary[] };
    const m = body.messages.find(
      (x) => (!subjectIncludes || x.Subject.includes(subjectIncludes)) && (!after || new Date(x.Created).getTime() >= after.getTime() - 1000),
    );
    if (m) {
      const full = (await (await fetch(`${MAILPIT}/message/${m.ID}`)).json()) as { Subject: string; Text: string };
      return { subject: full.Subject, text: full.Text };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Aucun e-mail reçu pour ${to}`);
}

export async function loginWithCode(page: Page, email: string) {
  const since = new Date();
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail professionnelle").fill(email);
  await page.getByRole("button", { name: "Recevoir un lien et un code" }).click();
  await expect(page.getByRole("heading", { name: "Vérifiez vos e-mails" })).toBeVisible();
  const mail = await waitForMail(email, "code de connexion", since);
  const code = /Code : (\d{6})/.exec(mail.text)![1]!;
  await page.getByLabel("Code à 6 chiffres").fill(code);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/mes-taches/);
}

export async function loginWithLink(page: Page, email: string) {
  const since = new Date();
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail professionnelle").fill(email);
  await page.getByRole("button", { name: "Recevoir un lien et un code" }).click();
  const mail = await waitForMail(email, "code de connexion", since);
  const link = /Lien : (\S+)/.exec(mail.text)![1]!;
  await page.goto(link);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/mes-taches/);
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}
