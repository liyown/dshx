import { api } from "./api.js";
import { targetSubmissionV2Schema } from "./catalog-schema.js";

export async function submitTargetVerification(
  hub: string,
  raw: unknown,
  idempotencyKey: string,
) {
  const input = targetSubmissionV2Schema.parse(raw);
  const pages = [];
  for (let offset = 0; offset < input.results.length; offset += 100)
    pages.push(
      await api(hub, "/api/ops/catalog/verification", {
        method: "PUT",
        body: JSON.stringify({
          schemaVersion: 2,
          checkedAt: input.checkedAt,
          idempotencyKey: `${idempotencyKey}:${Math.floor(offset / 100)}`,
          results: input.results.slice(offset, offset + 100),
        }),
      }),
    );
  return { submitted: input.results.length, pages };
}
