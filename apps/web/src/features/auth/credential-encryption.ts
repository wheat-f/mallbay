import type { AuthPublicKeyResponse } from "@mallbay/shared";

export async function encryptPassword(password: string, publicKey: AuthPublicKeyResponse) {
  if (!window.crypto?.subtle) {
    throw new Error("当前访问环境不支持加密登录，请使用 HTTPS 或联系管理员配置测试环境登录策略");
  }

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
