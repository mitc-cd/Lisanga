import { expect, test, type Page } from "@playwright/test";
import { loginWithCode, loginWithLink, logout, waitForMail } from "./helpers";
import { E2E_SETUP_TOKEN } from "../playwright.config";

/**
 * Parcours principal du lot 1, dans l'ordre de livraison :
 * installation → SMTP (Mailpit) → invitation → connexion par code → projet → tâche assignée →
 * Mes tâches → déplacement au tableau (persisté) → commentaire avec mention → notification →
 * connexion par lien. Puis visibilité d'un projet privé pour un utilisateur sans accès.
 */
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const ADMIN = { name: "Admin Essai", email: `admin-${run}@e2e.mitc.test` };
const COLLAB = { name: "Collab Essai", email: `collab-${run}@e2e.mitc.test` };
const TASK = "Rédiger le cahier des charges";
let projectId = "";
let privateTaskUrl = "";
let privateProjectUrl = "";

async function asAdmin(page: Page) {
  await logout(page);
  await loginWithCode(page, ADMIN.email);
}

test("1-2. Installation (premier administrateur) puis configuration SMTP avec e-mail de test", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/installation/);
  await page.getByLabel("Jeton d'installation").fill(E2E_SETUP_TOKEN);
  await page.getByLabel("Votre nom").fill(ADMIN.name);
  await page.getByLabel("Votre adresse e-mail professionnelle").fill(ADMIN.email);
  await page.getByRole("button", { name: "Créer le compte administrateur" }).click();
  await expect(page).toHaveURL(/\/admin\/parametres\?etape=smtp/);
  await expect(page.getByText("Dernière étape de l'installation")).toBeVisible();
  // L'assistant est ensuite définitivement désactivé
  await page.goto("/installation");
  await expect(page.getByRole("heading", { name: "Installation terminée" })).toBeVisible();
  await expect(page.getByLabel("Jeton d'installation")).toHaveCount(0);

  // Session ouverte par l'assistant : configuration SMTP
  await page.goto("/admin/parametres");
  // Erreur traduite, configuration non enregistrée
  await page.getByLabel("Hôte").fill("localhost");
  await page.getByLabel("Chiffrement").selectOption("none");
  await page.getByLabel("Port", { exact: true }).fill("1");
  await page.getByLabel("Adresse d'expéditeur").fill("projets@e2e.mitc.test");
  await page.getByRole("button", { name: "Envoyer un e-mail de test et activer" }).click();
  await expect(page.getByText(/Connexion refusée|Délai dépassé|injoignable/)).toBeVisible();
  await expect(page.getByText("La configuration active n'a pas été modifiée.")).toBeVisible();
  // Configuration valide (Mailpit)
  const since = new Date();
  await page.getByLabel("Port", { exact: true }).fill("11025");
  await page.getByRole("button", { name: "Envoyer un e-mail de test et activer" }).click();
  await expect(page.getByText("Configuration active et fonctionnelle")).toBeVisible();
  const mail = await waitForMail(ADMIN.email, "e-mail de test", since);
  expect(mail.text).toContain("fonctionne");
});

test("3. Invitation d'un membre", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/admin/membres");
  const since = new Date();
  await page.getByLabel("Adresse e-mail").fill(COLLAB.email);
  await page.getByLabel("Nom (facultatif)").fill(COLLAB.name);
  await page.getByRole("button", { name: "Inviter" }).click();
  await expect(page.getByText("Invitation envoyée.")).toBeVisible();
  await expect(page.getByText("Invitation en attente")).toBeVisible();
  const mail = await waitForMail(COLLAB.email, "vous invite", since);
  expect(mail.text).toContain(COLLAB.email);
});

test("4-6. Connexion par code, création d'un projet, d'une tâche et assignation", async ({ page }) => {
  // Le membre invité se connecte une première fois (compte activé)
  await loginWithCode(page, COLLAB.email);
  await expect(page.getByRole("heading", { name: "Mes tâches" })).toBeVisible();
  await expect(page.getByText("Rien à faire pour l'instant")).toBeVisible();

  await asAdmin(page);
  await page.goto("/projets");
  await page.getByRole("button", { name: "Nouveau projet" }).click();
  await page.getByLabel("Nom du projet").fill("Projet E2E");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page).toHaveURL(/\/projets\/[0-9a-f-]{36}/);
  projectId = /projets\/([0-9a-f-]{36})/.exec(page.url())![1]!;

  // Ajout du membre au projet
  await page.goto(`/projets/${projectId}/parametres`);
  await page.getByLabel("Ajouter une personne").selectOption({ label: `${COLLAB.name} — ${COLLAB.email}` });
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.getByText("Membre ajouté.")).toBeVisible();

  // Création rapide (Entrée) puis assignation dans le panneau latéral
  await page.goto(`/projets/${projectId}`);
  const quick = page.getByLabel(/Ajouter une tâche dans « À faire »/);
  await quick.fill(TASK);
  await quick.press("Enter");
  await expect(quick).toHaveValue("");
  await page.getByRole("listitem", { name: TASK }).click();
  const panel = page.getByRole("complementary", { name: "Détail de la tâche" });
  await expect(panel.getByLabel("Titre de la tâche")).toHaveValue(TASK);
  await panel.getByLabel("Responsable").selectOption({ label: COLLAB.name });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kinshasa" }).format(new Date());
  await panel.getByLabel("Échéance").fill(today);
  await expect(panel.getByText(/a assigné la tâche à Collab Essai/)).toBeVisible();
  // Persistance après rechargement (vue Liste)
  await page.reload();
  await expect(page.getByRole("listitem", { name: TASK })).toBeVisible();
  await expect(panel.getByLabel("Responsable")).toHaveValue(/[0-9a-f-]{36}/);
});

test("7-8. Mes tâches puis déplacement dans le tableau (persisté)", async ({ page }) => {
  await loginWithCode(page, COLLAB.email);
  const group = page.getByRole("region", { name: /Aujourd'hui/ });
  await expect(group.getByText(TASK)).toBeVisible();

  await page.goto(`/projets/${projectId}?vue=tableau`);
  const card = page.locator(`[data-board-card]`, { hasText: TASK });
  await expect(page.getByRole("region", { name: "Colonne À faire" }).getByText(TASK)).toBeVisible();
  // Déplacement au clavier (Alt + →) vers la section suivante
  await card.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.getByRole("region", { name: "Colonne En cours" }).getByText(TASK)).toBeVisible();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByRole("region", { name: "Colonne En cours" }).getByText(TASK)).toBeVisible();
  // Vue Liste synchronisée après rechargement
  await page.goto(`/projets/${projectId}`);
  await expect(page.getByRole("region", { name: "Section En cours" }).getByText(TASK)).toBeVisible();
});

test("9-10. Commentaire avec mention puis notification au destinataire autorisé (connexion par lien)", async ({ page }) => {
  await loginWithCode(page, COLLAB.email);
  await page.goto(`/projets/${projectId}`);
  await page.getByRole("listitem", { name: TASK }).click();
  const box = page.getByLabel(/Écrire un commentaire/);
  await box.fill("Brouillon prêt, merci de relire @Adm");
  await page.getByRole("listbox", { name: "Personnes à mentionner" }).getByRole("option", { name: ADMIN.name }).click();
  await box.pressSequentially("avant vendredi.");
  await page.getByRole("button", { name: "Commenter" }).click();
  await expect(page.getByText("Brouillon prêt, merci de relire")).toBeVisible();

  await logout(page);
  await loginWithLink(page, ADMIN.email);
  await page.goto("/boite");
  const item = page.getByRole("button", { name: /Collab Essai vous a mentionné dans Rédiger le cahier des charges/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(new RegExp(`/projets/${projectId}\\?tache=`), { timeout: 30_000 });
});

test("Projet privé : invisible et inaccessible pour un utilisateur sans accès", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/projets?nouveau=1");
  await page.getByLabel("Nom du projet").fill("Dossier confidentiel E2E");
  await page.getByText("Privé", { exact: true }).click();
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page).toHaveURL(/\/projets\/[0-9a-f-]{36}/);
  privateProjectUrl = new URL(page.url()).pathname;
  const quick = page.getByLabel(/Ajouter une tâche dans « À faire »/);
  await quick.fill("Note secrète budget");
  await quick.press("Enter");
  await page.getByRole("listitem", { name: "Note secrète budget" }).click();
  await expect(page).toHaveURL(/tache=/);
  privateTaskUrl = `/taches/${new URL(page.url()).searchParams.get("tache")}`;

  await logout(page);
  await loginWithCode(page, COLLAB.email);
  // Absent de Mes tâches et de la barre latérale
  await expect(page.getByText("Note secrète budget")).toHaveCount(0);
  await expect(page.getByText("Dossier confidentiel E2E")).toHaveCount(0);
  // Absent de la recherche
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Rechercher une tâche, un projet, une action…").fill("secrète");
  await expect(page.getByText("Aucun résultat.")).toBeVisible();
  await page.keyboard.press("Escape");
  // Liens directs refusés (même réponse qu'un élément inexistant)
  const r1 = await page.goto(privateTaskUrl);
  expect(r1?.status()).toBe(404);
  const r2 = await page.goto(privateProjectUrl);
  expect(r2?.status()).toBe(404);
  const api = await page.request.get(`/api${privateTaskUrl}`);
  expect(api.status()).toBe(404);
  const fake = await page.request.get(`/api/taches/00000000-0000-4000-8000-000000000000`);
  expect(fake.status()).toBe(404);
  expect(await api.json()).toEqual(await fake.json());
  // Pages d'administration inaccessibles à un membre
  const adm = await page.goto("/admin/parametres");
  expect(adm?.status()).toBe(404);
});
