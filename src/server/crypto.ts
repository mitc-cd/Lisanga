import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Chiffrement des secrets en base : AES-256-GCM.
 * Format stocké : "v1:" + base64(iv[12] | tag[16] | chiffré).
 * Clé maître : SETTINGS_ENCRYPTION_KEY (32 octets encodés en base64), uniquement en variable d'environnement.
 */
function masterKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) throw new Error("SETTINGS_ENCRYPTION_KEY n'est pas défini.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("SETTINGS_ENCRYPTION_KEY doit faire 32 octets (base64).");
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith("v1:")) throw new Error("Format de secret inconnu.");
  const buf = Buffer.from(stored.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Hachage déterministe (HMAC-SHA256 avec le secret serveur) pour codes et jetons. */
export function hashToken(value: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET n'est pas défini.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}
