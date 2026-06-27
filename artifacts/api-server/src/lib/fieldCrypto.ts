import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// At-rest field encryption for sensitive free-text columns written through raw
// SQL (where Drizzle's transparent `encryptedText` custom type can't be used).
// Deliberately the SAME scheme + key + wire format as
// lib/db/src/schema/encrypted-text.ts, so the two interoperate and behave
// identically:
//   • AES-256-GCM, key = sha256(TOKEN_ENC_KEY)
//   • stored format: "enc:v1:" + base64( iv(12) | authTag(16) | ciphertext )
//
// Graceful degradation (same contract as encrypted-text.ts):
//   • No TOKEN_ENC_KEY set → values pass through as PLAINTEXT (no-op), so
//     shipping this changes nothing until the key is provisioned in Railway.
//   • Reading a legacy plaintext value (no "enc:v1:" prefix) → returned as-is,
//     so existing rows keep working and get encrypted on their next write.
//
// NOTE: the key lives on the server, so this protects against plaintext DB
// dumps / casual DB access — NOT against an operator who holds the key. It is
// encryption AT REST, not end-to-end.

const ENC_PREFIX = "enc:v1:";

function encKey(): Buffer | null {
  const raw = process.env["TOKEN_ENC_KEY"];
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

/** Is at-rest field encryption actually active (a key is configured)? */
export function fieldEncryptionActive(): boolean {
  return encKey() !== null;
}

/** Encrypt a UTF-8 string for storage. Passes through plaintext if no key. */
export function encryptField(plain: string): string {
  const key = encKey();
  if (!key) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Decrypt a stored value. Legacy plaintext (no prefix) is returned as-is;
 *  an encrypted value with no/wrong key fails CLOSED (returns "") rather than
 *  throwing, so a bad key never 500s a query. */
export function decryptField(stored: string): string {
  if (typeof stored !== "string" || !stored.startsWith(ENC_PREFIX)) return stored;
  const key = encKey();
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
    return "";
  }
}
