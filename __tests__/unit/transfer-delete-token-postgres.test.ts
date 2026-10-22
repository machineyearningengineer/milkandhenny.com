import { createCipheriv, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  decryptTransferDeleteToken,
  encryptTransferDeleteToken,
  verifyTransferDeleteToken,
} from "@/features/transfers/delete-token-postgres.server";

describe("Postgres transfer deletion-token codec", () => {
  beforeEach(() => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "unit-test-transfer-key-material-at-least-32-bytes");
    vi.stubEnv("AUTH_SECRET", "independent-signing-key-material-at-least-32-bytes");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips with transfer-bound authenticated encryption", () => {
    const first = encryptTransferDeleteToken("transfer-one", "private-delete-token");
    const second = encryptTransferDeleteToken("transfer-one", "private-delete-token");
    expect(first.nonce).not.toEqual(second.nonce);
    expect(first.ciphertext.includes(Buffer.from("private-delete-token"))).toBe(false);
    expect(decryptTransferDeleteToken("transfer-one", first.ciphertext, first.nonce)).toBe(
      "private-delete-token",
    );
    expect(verifyTransferDeleteToken("private-delete-token", first.hash)).toBe(true);
    expect(verifyTransferDeleteToken("wrong-token", first.hash)).toBe(false);
  });

  it("rejects a different transfer identity and modified ciphertext", () => {
    const sealed = encryptTransferDeleteToken("transfer-one", "private-delete-token");
    expect(() =>
      decryptTransferDeleteToken("transfer-two", sealed.ciphertext, sealed.nonce),
    ).toThrow();
    const changed = Buffer.from(sealed.ciphertext);
    changed[0] ^= 1;
    expect(() => decryptTransferDeleteToken("transfer-one", changed, sealed.nonce)).toThrow();
  });

  it("opens the historical AUTH-derived ciphertext after copying that root into DATA_ENCRYPTION_KEY", () => {
    const historicalRoot = "historical-auth-root-material-at-least-32-bytes";
    const key = createHmac("sha256", historicalRoot)
      .update("mah:transfer:delete-token:aes-gcm:v1")
      .digest();
    const nonce = Buffer.alloc(12, 7);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from("mah:transfer:delete-token:auth-secret-v1:legacy-transfer"));
    const ciphertext = Buffer.concat([
      cipher.update("existing-delete-token", "utf8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    vi.stubEnv("DATA_ENCRYPTION_KEY", historicalRoot);
    expect(decryptTransferDeleteToken("legacy-transfer", ciphertext, nonce)).toBe(
      "existing-delete-token",
    );
  });

  it("preserves stored ciphertext when the signing key changes", () => {
    const sealed = encryptTransferDeleteToken("transfer-one", "private-delete-token");
    vi.stubEnv("AUTH_SECRET", "a-new-unrelated-signing-key-at-least-32-bytes");
    expect(decryptTransferDeleteToken("transfer-one", sealed.ciphertext, sealed.nonce)).toBe(
      "private-delete-token",
    );
    vi.stubEnv("DATA_ENCRYPTION_KEY", "a-different-encryption-key-at-least-32-bytes");
    expect(() =>
      decryptTransferDeleteToken("transfer-one", sealed.ciphertext, sealed.nonce),
    ).toThrow();
  });

  it("fails closed without the web encryption secret", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "");
    expect(() => encryptTransferDeleteToken("transfer-one", "private-delete-token")).toThrow(
      "DATA_ENCRYPTION_KEY unavailable",
    );
  });
});
