import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { requireBindings } from "@/lib/db/context";
import { agentResources } from "@/lib/db/schema";
import { HttpError } from "@/lib/http";

export const AGENT_RESOURCE_DEFINITIONS = {
  githubToken: {
    env: "GITHUB_TOKEN",
    label: "GitHub token",
    description: "Optional read-only GitHub token used by source discovery and inspection.",
    maxLength: 512,
    pattern: /^[A-Za-z0-9_.-]+$/u,
  },
} as const;

export type AgentResourceKey = keyof typeof AGENT_RESOURCE_DEFINITIONS;

export type AgentResourceStatus = {
  readonly key: AgentResourceKey;
  readonly env: string;
  readonly label: string;
  readonly description: string;
  readonly configured: boolean;
  readonly updatedAt: string | null;
};

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importKey(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bufferSource(key), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptValue(
  value: string,
  key: Uint8Array,
): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bufferSource(iv) },
    await importKey(key),
    new TextEncoder().encode(value),
  );
  return {
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(encrypted)),
  };
}

export async function decryptValue(
  iv: string,
  ciphertext: string,
  key: Uint8Array,
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bufferSource(fromBase64(iv)) },
    await importKey(key),
    bufferSource(fromBase64(ciphertext)),
  );
  return new TextDecoder().decode(decrypted);
}

function resourceKey(context: unknown): Uint8Array {
  const raw = requireBindings(context).AGENT_RESOURCE_KEY;
  if (typeof raw !== "string" || raw.trim() === "")
    throw new HttpError(
      503,
      "Agent resource encryption key is not configured",
      "resource_key_unavailable",
    );
  let key: Uint8Array;
  try {
    key = fromBase64(raw);
  } catch {
    throw new HttpError(503, "Agent resource encryption key is invalid", "resource_key_invalid");
  }
  if (key.length !== 32)
    throw new HttpError(
      503,
      "Agent resource encryption key must be 32 bytes",
      "resource_key_invalid",
    );
  return key;
}

export async function listAgentResourceStatus(db: Database): Promise<AgentResourceStatus[]> {
  const rows = await db
    .select({ key: agentResources.key, updatedAt: agentResources.updatedAt })
    .from(agentResources);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return (Object.keys(AGENT_RESOURCE_DEFINITIONS) as AgentResourceKey[]).map((key) => {
    const definition = AGENT_RESOURCE_DEFINITIONS[key];
    const row = byKey.get(key);
    return {
      key,
      env: definition.env,
      label: definition.label,
      description: definition.description,
      configured: row !== undefined,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  });
}

export async function saveAgentResource(
  db: Database,
  context: unknown,
  key: string,
  value: string,
  userId: string,
): Promise<void> {
  if (!Object.hasOwn(AGENT_RESOURCE_DEFINITIONS, key))
    throw new HttpError(422, "Unknown agent resource", "invalid_resource");
  const definition = AGENT_RESOURCE_DEFINITIONS[key as AgentResourceKey];
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > definition.maxLength ||
    !definition.pattern.test(normalized)
  )
    throw new HttpError(422, "Agent resource value is invalid", "invalid_resource");
  const encrypted = await encryptValue(normalized, resourceKey(context));
  const updatedAt = new Date();
  await db
    .insert(agentResources)
    .values({
      key,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      updatedByUserId: userId,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: agentResources.key,
      set: {
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext,
        updatedByUserId: userId,
        updatedAt,
      },
    });
}

export async function clearAgentResource(db: Database, key: string): Promise<void> {
  if (!Object.hasOwn(AGENT_RESOURCE_DEFINITIONS, key))
    throw new HttpError(422, "Unknown agent resource", "invalid_resource");
  await db.delete(agentResources).where(eq(agentResources.key, key));
}

export async function loadAgentResources(
  db: Database,
  context: unknown,
): Promise<Record<string, string>> {
  const rows = await db.select().from(agentResources);
  if (rows.length === 0) return {};
  const key = resourceKey(context);
  const resources: Record<string, string> = {};
  for (const row of rows) {
    if (!Object.hasOwn(AGENT_RESOURCE_DEFINITIONS, row.key)) continue;
    const definition = AGENT_RESOURCE_DEFINITIONS[row.key as AgentResourceKey];
    try {
      resources[definition.env] = await decryptValue(row.iv, row.ciphertext, key);
    } catch {
      throw new HttpError(
        503,
        "Agent resource could not be decrypted",
        "resource_decryption_failed",
      );
    }
  }
  return resources;
}
