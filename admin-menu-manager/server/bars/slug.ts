const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export type BarSlugGenerator = () => string;

export function createRandomBarSlug(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `bar-${Array.from(bytes, (byte) => SLUG_ALPHABET[byte % SLUG_ALPHABET.length]).join("")}`;
}

export function encodeBarSlug(slug: string): string {
  const bytes = new TextEncoder().encode(slug);
  let output = "";
  let index = 0;
  while (index < bytes.length) {
    const first = bytes[index++] ?? 0;
    const second = bytes[index++];
    const third = bytes[index++];

    output += base64Char(first >> 2);
    output += base64Char(((first & 0x03) << 4) | ((second ?? 0) >> 4));
    if (second === undefined) break;
    output += base64Char(((second & 0x0f) << 2) | ((third ?? 0) >> 6));
    if (third === undefined) break;
    output += base64Char(third & 0x3f);
  }
  return output;
}

function base64Char(value: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return alphabet[value] ?? "A";
}
