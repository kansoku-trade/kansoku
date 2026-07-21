// WebCrypto twin of packages/core/src/license/bundleKeyWrap.ts — the two
// implementations must stay byte-compatible (same alg id, HKDF info string,
// and ciphertext+tag layout), the client unwraps with node:crypto.
export const BUNDLE_KEY_WRAP_ALG = "p256-hkdf-sha256-aes256gcm";
const HKDF_INFO = "kansoku-bundle-key-wrap-v1";

export interface BundleKeyWrapResult {
  /** base64 ciphertext+tag — sent as the response's bundleKey field */
  wrapped: string;
  wrap: { alg: string; eph: string; iv: string };
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Wrap the bundle key to the client's device public key (base64 SPKI P-256).
 * Returns null when the device key is missing/malformed — the caller then
 * falls back to a plaintext bundleKey for backward compatibility.
 */
export async function wrapBundleKeyForDevice(
  bundleKeyHex: string,
  devicePublicKeyB64: string | undefined,
): Promise<BundleKeyWrapResult | null> {
  if (!devicePublicKeyB64) return null;
  try {
    const deviceKey = await crypto.subtle.importKey(
      "spki",
      b64ToBytes(devicePublicKeyB64),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
    const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: deviceKey }, ephemeral.privateKey, 256);
    const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
    const aesKeyBits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode(HKDF_INFO) },
      hkdfKey,
      256,
    );
    const aesKey = await crypto.subtle.importKey("raw", aesKeyBits, { name: "AES-GCM" }, false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(bundleKeyHex));
    const ephSpki = await crypto.subtle.exportKey("spki", ephemeral.publicKey);
    return {
      wrapped: bytesToB64(new Uint8Array(ciphertext)),
      wrap: { alg: BUNDLE_KEY_WRAP_ALG, eph: bytesToB64(new Uint8Array(ephSpki)), iv: bytesToB64(iv) },
    };
  } catch {
    return null;
  }
}
