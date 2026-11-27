import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

const env = config({ path: ".env.test", quiet: true }).parsed ?? {};
export const E2E_SETUP_TOKEN = "e2e-setup-token-0123456789abcdef";
const serverEnv = { ...process.env, ...env, SETUP_TOKEN: E2E_SETUP_TOKEN, PORT: "3100" } as Record<string, string>;

/**
 * E2E sur la base mitc_test (vidée au démarrage) et Mailpit.
 * Par défaut : build de production puis `next start` (PW_DEV=1 : serveur de dev, plus rapide pour itérer).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3100",
    locale: "fr-FR",
    timezoneId: "Africa/Kinshasa",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.PW_DEV ? "pnpm next dev -p 3100" : "pnpm next build && pnpm next start -p 3100",
    url: "http://localhost:3100/connexion",
    reuseExistingServer: false,
    timeout: 300_000,
    env: serverEnv,
    stdout: "pipe",
  },
});
