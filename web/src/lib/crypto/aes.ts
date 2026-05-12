const ALG = "AES-GCM";
const IV_LEN = 12;

export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALG, length: 256 }, true, ["encrypt", "decrypt"]);
}

export function randomIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LEN));
}

export async function encrypt(data: ArrayBuffer | Uint8Array, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.encrypt({ name: ALG, iv: iv as BufferSource }, key, data as BufferSource);
}

export async function decrypt(ciphertext: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: ALG, iv: iv as BufferSource }, key, ciphertext);
}

export async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey("raw", key);
}

export async function importKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, ALG, true, ["encrypt", "decrypt"]);
}

export function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
