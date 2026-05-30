import type { AuthPublicKeyResponse } from "@mallbay/shared";

export async function encryptPassword(password: string, publicKey: AuthPublicKeyResponse) {
  const key = await window.crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(publicKey.publicKey),
    {
      name: "RSA-OAEP",
      hash: "SHA-256"
    },
    false,
    ["encrypt"]
  );
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    key,
    new TextEncoder().encode(password)
  );
  return arrayBufferToBase64(encrypted);
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s/g, "");
  return Uint8Array.from(window.atob(base64), (char) => char.charCodeAt(0)).buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}
