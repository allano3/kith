/**
 * At-rest encryption: AES-GCM-256 with a key derived from the user's passphrase
 * via PBKDF2-SHA-256. The key is non-extractable and lives only in memory while
 * the vault is unlocked. The passphrase is never stored.
 */

export const KDF_ITERATIONS = 600_000;

export interface SealedVault {
  format: 'kith-sealed';
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface VaultKey {
  key: CryptoKey;
  salt: string;
  iterations: number;
}

export async function deriveKey(passphrase: string, salt?: string, iterations = KDF_ITERATIONS): Promise<VaultKey> {
  const saltBytes = salt ? fromB64(salt) : crypto.getRandomValues(new Uint8Array(16));
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { key, salt: toB64(saltBytes), iterations };
}

export async function seal(vk: VaultKey, plaintext: string): Promise<SealedVault> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vk.key, enc.encode(plaintext));
  return {
    format: 'kith-sealed',
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: vk.iterations, salt: vk.salt },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: toB64(new Uint8Array(ct)),
  };
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('That passphrase does not unlock this vault.');
  }
}

/** Derives the key from the sealed header and decrypts. Throws WrongPassphraseError on authentication failure. */
export async function unseal(sealed: SealedVault, passphrase: string): Promise<{ plaintext: string; key: VaultKey }> {
  const key = await deriveKey(passphrase, sealed.kdf.salt, sealed.kdf.iterations);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.cipher.iv) }, key.key, fromB64(sealed.data));
    return { plaintext: dec.decode(pt), key };
  } catch {
    throw new WrongPassphraseError();
  }
}

export function isSealed(x: unknown): x is SealedVault {
  return typeof x === 'object' && x !== null && (x as SealedVault).format === 'kith-sealed';
}
