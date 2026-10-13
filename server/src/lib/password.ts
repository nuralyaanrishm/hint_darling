import { Algorithm, hash, verify } from "@node-rs/argon2";

// OWASP-recommended Argon2id parameters (19 MiB memory, 2 iterations, 1 lane).
const ARGON_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON_OPTIONS);
}

/** Verifies a password, returning false rather than throwing on malformed hashes. */
export async function verifyPassword(
  passwordHash: string,
  plaintext: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plaintext);
  } catch {
    return false;
  }
}
