const DISABLED_VALUES = new Set(["false", "0", "off", "disabled"]);

export function isCredentialEncryptionEnabled(
  value = process.env.NEXT_PUBLIC_AUTH_CREDENTIAL_ENCRYPTION_ENABLED
) {
  return !DISABLED_VALUES.has((value ?? "").trim().toLowerCase());
}
