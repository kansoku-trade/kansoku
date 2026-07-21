import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";

// Device-bound bundle key wrapping. The client generates an ECDH P-256
// keypair per activation and uploads the public key; the license Worker
// wraps the bundle key to it (ephemeral ECDH → HKDF-SHA256 → AES-256-GCM).
// The stored license record then holds a bundle key that only this device's
// private key can unwrap, and that private key lives inside the
// safeStorage-encrypted record — copying the record to another machine no
// longer carries a usable bundle key.
export const BUNDLE_KEY_WRAP_ALG = "p256-hkdf-sha256-aes256gcm";

// Must match the HKDF info string in apps/license-worker/src/bundleKeyWrap.ts.
const HKDF_INFO = "kansoku-bundle-key-wrap-v1";

export interface BundleKeyWrap {
  alg: string;
  /** base64 SPKI (DER) ephemeral public key */
  eph: string;
  /** base64 12-byte AES-GCM IV */
  iv: string;
}

export interface DeviceKeyPair {
  /** base64 SPKI (DER) public key, uploaded as device_public_key */
  publicKey: string;
  /** base64 PKCS8 (DER) private key, never leaves the license record */
  privateKey: string;
}

export function generateDeviceKeyPair(): DeviceKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    privateKey: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  };
}

function deriveWrapKey(privateKeyB64: string, peerPublicKeyB64: string): Buffer {
  const privateKey = createPrivateKey({ key: Buffer.from(privateKeyB64, "base64"), format: "der", type: "pkcs8" });
  const publicKey = createPublicKey({ key: Buffer.from(peerPublicKeyB64, "base64"), format: "der", type: "spki" });
  const shared = diffieHellman({ privateKey, publicKey });
  return Buffer.from(hkdfSync("sha256", shared, "", HKDF_INFO, 32));
}

/**
 * Unwrap a server-wrapped bundle key. `wrappedB64` is the response's
 * bundleKey field (base64 ciphertext+tag); returns the 64-char hex key.
 */
export function unwrapBundleKey(wrappedB64: string, wrap: BundleKeyWrap, devicePrivateKeyB64: string): string {
  if (wrap.alg !== BUNDLE_KEY_WRAP_ALG) {
    throw new Error(`unsupported bundleKey wrap alg: ${wrap.alg}`);
  }
  const key = deriveWrapKey(devicePrivateKeyB64, wrap.eph);
  const blob = Buffer.from(wrappedB64, "base64");
  const tag = blob.subarray(blob.length - 16);
  const ciphertext = blob.subarray(0, blob.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(wrap.iv, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Node-side twin of the Worker's wrapping routine — used by tests to
 * simulate server responses (the deployed wrapper runs on WebCrypto in
 * apps/license-worker; both must stay byte-compatible via the shared
 * HKDF info / alg contract).
 */
export function wrapBundleKey(bundleKeyHex: string, devicePublicKeyB64: string): { wrapped: string; wrap: BundleKeyWrap } {
  const eph = generateDeviceKeyPair();
  const key = deriveWrapKey(eph.privateKey, devicePublicKeyB64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(bundleKeyHex, "utf8")), cipher.final()]);
  const blob = Buffer.concat([ciphertext, cipher.getAuthTag()]);
  return {
    wrapped: blob.toString("base64"),
    wrap: { alg: BUNDLE_KEY_WRAP_ALG, eph: eph.publicKey, iv: iv.toString("base64") },
  };
}
