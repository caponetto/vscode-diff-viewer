const encoder = new TextEncoder();

export async function getSha1Hash(text: string): Promise<string> {
  const utf8Bytes = encoder.encode(text);
  const hash = await window.crypto.subtle.digest("SHA-1", utf8Bytes);
  const hashHex = Array.from(new Uint8Array(hash))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}
