import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64UrlFromBytes, constantTimeEqual, decodeBase64Url } from "./utils";

// Pure JS avoids Workers' native PBKDF2 iteration ceiling. The algorithm and
// work factor travel with each hash; old unversioned 120,000 hashes still verify.
const ITERATIONS = 600000;
const PREFIX = "pbkdf2-sha256$" + ITERATIONS + "$";
export function needsPasswordUpgrade(hash: string) { return !hash.startsWith(PREFIX); }
export async function deriveCustomerPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const hash = await pbkdf2Async(sha256, new TextEncoder().encode(password), salt, { c: ITERATIONS, dkLen: 32 });
  return { salt: base64UrlFromBytes(salt), hash: PREFIX + base64UrlFromBytes(hash) };
}
export async function verifyCustomerPassword(password: string, salt: string, encoded: string): Promise<boolean> {
  let iterations = 120000;
  let expected = encoded;
  if (encoded.includes("$")) {
    const parts = encoded.split("$");
    if (parts.length !== 3 || parts[0] !== "pbkdf2-sha256" || !/^(120000|600000)$/.test(parts[1])) return false;
    iterations = Number(parts[1]); expected = parts[2];
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(expected) || !/^[A-Za-z0-9_-]{22}$/.test(salt)) return false;
  const rawSalt = Uint8Array.from(decodeBase64Url(salt), char => char.charCodeAt(0));
  const hash = await pbkdf2Async(sha256, new TextEncoder().encode(password), rawSalt, { c: iterations, dkLen: 32 });
  return constantTimeEqual(base64UrlFromBytes(hash), expected);
}
