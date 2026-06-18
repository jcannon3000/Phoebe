/**
 * voiceCrypto — end-to-end encryption for ephemeral voice memos (ECIES over
 * Web Crypto: ECDH P-256 → HKDF-less AES-GCM-256).
 *
 * Each user holds a static ECDH keypair; the PRIVATE key never leaves the
 * device (localStorage), the PUBLIC key is published so fellows can encrypt to
 * them. A sender mints a per-memo EPHEMERAL keypair, derives a shared AES key
 * from (ephemeral-private × recipient-static-public), encrypts the audio, and
 * sends ciphertext + iv + the ephemeral public key. The recipient derives the
 * same key from (their-static-private × ephemeral-public). The server only ever
 * sees ciphertext — it can never decrypt.
 *
 * Note: the static private key lives in localStorage (readable by XSS in a
 * compromised page). Memos are ephemeral, so the blast radius is small, and a
 * cleared key just means future memos use a fresh key (old ones are already
 * gone). Acceptable for a beta voice feature; a Keychain-backed key is a future
 * hardening step.
 */
import { apiRequest } from "@/lib/queryClient";

const PRIV_KEY = "phoebe:voice-keypair";
const PUB_PUBLISHED = "phoebe:voice-pub-published";
const EC = { name: "ECDH", namedCurve: "P-256" } as const;

function abToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64ToAb(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function loadOrCreateKeyPair(): Promise<{ privateKey: CryptoKey; publicJwk: JsonWebKey }> {
  try {
    const stored = localStorage.getItem(PRIV_KEY);
    if (stored) {
      const { priv, pub } = JSON.parse(stored) as { priv: JsonWebKey; pub: JsonWebKey };
      const privateKey = await crypto.subtle.importKey("jwk", priv, EC, true, ["deriveKey"]);
      return { privateKey, publicJwk: pub };
    }
  } catch { /* regenerate below */ }
  const kp = await crypto.subtle.generateKey(EC, true, ["deriveKey"]) as CryptoKeyPair;
  const priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pub = await crypto.subtle.exportKey("jwk", kp.publicKey);
  try { localStorage.setItem(PRIV_KEY, JSON.stringify({ priv, pub })); } catch { /* private mode */ }
  return { privateKey: kp.privateKey, publicJwk: pub };
}

/** Idempotently publish my public key so fellows can encrypt voice memos to me. */
export async function ensureVoiceKeysPublished(): Promise<void> {
  if (typeof crypto === "undefined" || !crypto.subtle) return;
  const { publicJwk } = await loadOrCreateKeyPair();
  const serialized = JSON.stringify(publicJwk);
  try { if (localStorage.getItem(PUB_PUBLISHED) === serialized) return; } catch { /* ignore */ }
  await apiRequest("POST", "/api/keys/public", { publicKeyJwk: serialized });
  try { localStorage.setItem(PUB_PUBLISHED, serialized); } catch { /* ignore */ }
}

export function voiceSupported(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle && typeof MediaRecorder !== "undefined";
}

export type EncryptedMemo = { ciphertext: string; iv: string; ephemeralPublicJwk: string };

export async function encryptVoice(recipientPublicKeyJwk: string, audio: ArrayBuffer): Promise<EncryptedMemo> {
  const recipientPub = await crypto.subtle.importKey("jwk", JSON.parse(recipientPublicKeyJwk), EC, false, []);
  const eph = await crypto.subtle.generateKey(EC, true, ["deriveKey"]) as CryptoKeyPair;
  const aesKey = await crypto.subtle.deriveKey({ name: "ECDH", public: recipientPub }, eph.privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, audio);
  const ephPub = await crypto.subtle.exportKey("jwk", eph.publicKey);
  return { ciphertext: abToB64(ct), iv: abToB64(iv.buffer), ephemeralPublicJwk: JSON.stringify(ephPub) };
}

export async function decryptVoice(memo: EncryptedMemo): Promise<ArrayBuffer> {
  const { privateKey } = await loadOrCreateKeyPair();
  const ephPub = await crypto.subtle.importKey("jwk", JSON.parse(memo.ephemeralPublicJwk), EC, false, []);
  const aesKey = await crypto.subtle.deriveKey({ name: "ECDH", public: ephPub }, privateKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const iv = new Uint8Array(b64ToAb(memo.iv));
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, b64ToAb(memo.ciphertext));
}
