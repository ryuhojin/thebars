const textEncoder = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function randomSecret(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const leftHash = new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(left)));
  const rightHash = new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(right)));
  let diff = leftHash.length ^ rightHash.length;
  const length = Math.max(leftHash.length, rightHash.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (leftHash[index] ?? 0) ^ (rightHash[index] ?? 0);
  }
  return diff === 0;
}

export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

export function isBeforeIso(left: string, right: Date): boolean {
  return new Date(left).getTime() < right.getTime();
}
