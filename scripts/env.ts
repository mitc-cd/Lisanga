/** Chargement de l'environnement pour les scripts (hors Next.js). */
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
