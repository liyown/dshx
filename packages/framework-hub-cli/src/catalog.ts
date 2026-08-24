import { api } from "./api.js";
import {
  calculateContentSourceHash,
  catalogProposalPageV2Schema,
  type CatalogProposalV2,
} from "./catalog-schema.js";
import { CliError } from "./errors.js";
import { loadAllInventory, loadInventoryPage } from "./metrics.js";

export type OperationsContract = {
  kind: string;
  version: number;
  schema: Record<string, unknown>;
  policy: {
    categories?: string[];
    capabilityKinds?: string[];
    contentSourceHash?: string;
    maxPageSize: number;
  };
};

export async function loadContract(hub: string, kind: string) {
  return api<OperationsContract>(
    hub,
    `/api/ops/contracts/${encodeURIComponent(kind)}`,
  );
}

export async function loadCatalogInventory(
  hub: string,
  options: { all?: boolean; cursor?: string; limit?: number },
) {
  return options.all
    ? loadAllInventory(hub)
    : loadInventoryPage(hub, {
        ...(options.cursor ? { cursor: options.cursor } : {}),
        ...(options.limit ? { limit: options.limit } : {}),
      });
}

export async function loadCatalogWorklist(hub: string) {
  return api(hub, "/api/ops/work-items");
}

export function validateCatalogPage(
  raw: unknown,
  categories: string[] = [],
): { valid: true; schemaVersion: 2; items: CatalogProposalV2[] } {
  const input = catalogProposalPageV2Schema.parse(raw);
  const allowed = new Set(categories);
  for (const [index, proposal] of input.items.entries()) {
    const expected = calculateContentSourceHash(proposal.sources);
    if (proposal.contentSourceHash !== expected)
      throw new CliError({
        code: "content_source_hash_mismatch",
        stage: "catalog.check",
        path: `items.${index}.contentSourceHash`,
        message: "contentSourceHash does not match the hashed content sources.",
        retryable: false,
        repairHint: `Use the computed hash ${expected} and update both localizations before retrying.`,
        details: { expected, actual: proposal.contentSourceHash },
      });
    const unknown = proposal.categories.filter(
      (category) => allowed.size && !allowed.has(category),
    );
    if (unknown.length)
      throw new CliError({
        code: "unknown_category",
        stage: "catalog.check",
        path: `items.${index}.categories`,
        message: `Unknown controlled categories: ${unknown.join(", ")}`,
        retryable: false,
        repairHint:
          "Choose categories returned by dshx-hub contract show --kind catalog.",
      });
  }
  const identities = input.items.map(
    (proposal) => proposal.verification.identityKey,
  );
  if (new Set(identities).size !== identities.length)
    throw new CliError({
      code: "duplicate_identity",
      stage: "catalog.check",
      path: "items",
      message: "The proposal page contains duplicate plugin identities.",
      retryable: false,
      repairHint: "Keep one complete proposal per stable plugin identity.",
    });
  return { valid: true, schemaVersion: 2, items: input.items };
}
