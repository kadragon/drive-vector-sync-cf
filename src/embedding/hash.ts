/**
 * Computes a SHA-256 hash of the given text for chunk deduplication.
 *
 * @param text - The text content to hash
 * @returns A hex-encoded SHA-256 hash string
 */
export async function computeChunkHash(text: string): Promise<string> {
  // Encode the text as UTF-8
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  // Compute SHA-256 hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}
