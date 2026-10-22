/**
 * The content fingerprint derived ids and content hashes are made from.
 *
 * Observation ids, install-target ids and the curation source hash are all
 * "sha-256 of this canonical text", and uploaded media is the same hash over
 * bytes. One spelling means a change to the encoding cannot leave half the
 * catalog hashing differently.
 */

export async function digest(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const hashed = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
