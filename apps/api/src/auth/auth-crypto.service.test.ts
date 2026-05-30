import assert from "node:assert/strict";
import { test } from "node:test";
import { constants, publicEncrypt } from "crypto";
import { AuthCryptoService } from "./auth-crypto.service";

test("AuthCryptoService decrypts credentials encrypted with its public key", () => {
  const service = new AuthCryptoService();
  const publicKey = service.getPublicKey();
  const encryptedPassword = publicEncrypt(
    {
      key: publicKey.publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    Buffer.from("Test1234!")
  ).toString("base64");

  assert.equal(publicKey.algorithm, "RSA-OAEP-256");
  assert.equal(service.decryptPassword(encryptedPassword), "Test1234!");
});
