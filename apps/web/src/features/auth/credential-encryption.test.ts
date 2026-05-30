import assert from "node:assert/strict";
import { test } from "node:test";
import { constants, generateKeyPairSync, privateDecrypt, webcrypto } from "crypto";
import { encryptPassword } from "./credential-encryption";

test("encryptPassword encrypts password with RSA-OAEP public key", async () => {
  const keyPair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem"
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem"
    }
  });
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      crypto: webcrypto,
      atob: (value: string) => Buffer.from(value, "base64").toString("binary"),
      btoa: (value: string) => Buffer.from(value, "binary").toString("base64")
    }
  });

  try {
    const encrypted = await encryptPassword("Test1234!", {
      algorithm: "RSA-OAEP-256",
      publicKey: keyPair.publicKey
    });
    const decrypted = privateDecrypt(
      {
        key: keyPair.privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256"
      },
      Buffer.from(encrypted, "base64")
    ).toString("utf8");

    assert.notEqual(encrypted, "Test1234!");
    assert.equal(decrypted, "Test1234!");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow
    });
  }
});
