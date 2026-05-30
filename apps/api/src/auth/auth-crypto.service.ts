import { BadRequestException, Injectable } from "@nestjs/common";
import { constants, generateKeyPairSync, privateDecrypt } from "crypto";

@Injectable()
export class AuthCryptoService {
  private readonly keyPair = generateKeyPairSync("rsa", {
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

  getPublicKey() {
    return {
      algorithm: "RSA-OAEP-256",
      publicKey: this.keyPair.publicKey
    };
  }

  decryptPassword(encryptedPassword: string) {
    try {
      return privateDecrypt(
        {
          key: this.keyPair.privateKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256"
        },
        Buffer.from(encryptedPassword, "base64")
      ).toString("utf8");
    } catch {
      throw new BadRequestException("登录凭据无效");
    }
  }
}
