import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Password hashing using Node's built-in scrypt (memory-hard KDF). No native
// or third-party dependency required. Format stored in the DB:
//   scrypt$N$r$p$<saltB64url>$<hashB64url>
// Parameters are embedded so future cost increases don't break old hashes.

// Promisified scrypt that preserves the options overload (promisify's types
// drop it, so we wrap it explicitly).
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

const N = 16384; // CPU/memory cost
const R = 8; // block size
const P = 1; // parallelism
const KEY_LEN = 64;
const SALT_LEN = 16;

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length < 12) {
    // Enforced here as a last line of defence; services also validate.
    throw new Error("Password must be at least 12 characters.");
  }
  const salt = randomBytes(SALT_LEN);
  const derived = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P });
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "base64url");
    expected = Buffer.from(parts[5]!, "base64url");
  } catch {
    return false;
  }

  const derived = await scrypt(password, salt, expected.length, { N: n, r, p });
  // Constant-time comparison to avoid timing side channels.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
