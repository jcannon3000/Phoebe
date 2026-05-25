import { customType } from "drizzle-orm/pg-core";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// Transparent at-rest encryption for sensitive token columns (Google
// OAuth access/refresh tokens). AES-256-GCM with a key derived from the
// TOKEN_ENC_KEY env var. Drizzle calls `toDriver` on write and
// `fromDriver` on read, so every consumer that touches the column gets
// encryption/decryption automatically — no call-site changes.
//
// Degrades gracefully, by design:
//   • No TOKEN_ENC_KEY set  → values pass through as plaintext, so the
//     column behaves EXACTLY as before until a key is provisioned in
//     Railway. Shipping this is a no-op until you set the key.
//   • Reading a legacy plaintext value (no "enc:v1:" prefix) → returned
//     as-is, so existing rows keep working; they're encrypted the next
//     time they're written (lazy migration on the next token refresh).
//
// Stored format: "enc:v1:" + base64( iv(12) | authTag(16) | ciphertext ).

const ENC_PREFIX = "enc:v1:";

// 32-byte AES-256 key derived from the env secret (any length in, 32
// bytes out). Returns null when unset → callers pass through plaintext.
function encKey(): Buffer | null {
  const raw = process.env["TOKEN_ENC_KEY"];
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

function encrypt(plain: string): string {
  const key = encKey();
  if (!key) return plain; // no key configured → leave plaintext
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

function decrypt(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored; // legacy plaintext
  const key = encKey();
  // Encrypted value but no key → can't read it. Surfacing null is safer
  // than throwing (which would 500 any query selecting this column); the
  // feature using the token degrades instead of taking the request down.
  if (!key) return "";
  try {
    const buf = Buffer.from(stored.slice(ENC_PREFIX.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return ""; // tampered / wrong key — fail closed, don't crash
  }
}

export const encryptedText = (name: string) =>
  customType<{ data: string; driverData: string }>({
    dataType() {
      return "text";
    },
    toDriver(value: string): string {
      // Defensive null-guard — drizzle handles null at the column level,
      // but never crash a write if a null slips through.
      if (value == null) return value as unknown as string;
      return encrypt(value);
    },
    fromDriver(value: string): string {
      if (value == null) return value as unknown as string;
      return decrypt(value);
    },
  })(name);
