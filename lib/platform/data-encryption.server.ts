/** Durable encryption must never fall back to the independently rotatable signing key. */
export function getDataEncryptionSecret(): string | null {
  const secret = process.env.DATA_ENCRYPTION_KEY?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

export function requireDataEncryptionSecret(): string {
  const secret = getDataEncryptionSecret();
  if (!secret) throw new Error("DATA_ENCRYPTION_KEY unavailable (minimum 32 characters)");
  return secret;
}
