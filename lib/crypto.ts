import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM, no SDK dependency — same "no SDK" convention as
// lib/modules/payments/razorpay.ts. Used to encrypt SocialAccount.pageAccessToken
// at rest (Instagram OAuth milestone). Ciphertext is a single hex string
// (iv:authTag:ciphertext) so it fits the existing String column with no
// schema change.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export class EncryptionNotConfiguredError extends Error {
  constructor() {
    super("TOKEN_ENCRYPTION_KEY is not configured on this environment.");
    this.name = "EncryptionNotConfiguredError";
  }
}

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new EncryptionNotConfiguredError();

  const keyBuf = Buffer.from(key, "base64");
  if (keyBuf.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded).");
  }
  return keyBuf;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decrypt(encoded: string): string {
  const key = getKey();
  const [ivHex, authTagHex, ciphertextHex] = encoded.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Malformed encrypted value — expected iv:authTag:ciphertext.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
