import { randomSecret, toBase64Url } from "./crypto";

const textEncoder = new TextEncoder();
const DEFAULT_ITERATIONS = 60000;

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, storedHash: string): Promise<boolean>;
}

export class Pbkdf2PasswordHasher implements PasswordHasher {
  constructor(private readonly iterations = DEFAULT_ITERATIONS) {}

  async hash(password: string): Promise<string> {
    const salt = randomSecret(18);
    const derived = await derivePassword(password, salt, this.iterations);
    return `pbkdf2-sha256$${this.iterations}$${salt}$${derived}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const [algorithm, iterationsRaw, salt, expected] = storedHash.split("$");
    if (algorithm !== "pbkdf2-sha256" || !iterationsRaw || !salt || !expected) return false;
    const iterations = Number.parseInt(iterationsRaw, 10);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;
    const actual = await derivePassword(password, salt, iterations);
    return actual === expected;
  }
}

export class FastTestPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return `test$${password}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    return storedHash === `test$${password}`;
  }
}

async function derivePassword(password: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: textEncoder.encode(salt),
      iterations
    },
    key,
    256
  );
  return toBase64Url(new Uint8Array(bits));
}
