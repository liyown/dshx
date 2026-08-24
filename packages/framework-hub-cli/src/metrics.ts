import { api } from "./api.js";
import { metricObservationPageV2Schema } from "./catalog-schema.js";

export type InventoryPage = {
  items: Array<Record<string, unknown>>;
  nextCursor: string | null;
};

export async function loadInventoryPage(
  hub: string,
  options: { cursor?: string; limit?: number } = {},
) {
  const query = new URLSearchParams({ limit: String(options.limit ?? 100) });
  if (options.cursor) query.set("cursor", options.cursor);
  return api<InventoryPage>(hub, `/api/ops/catalog/inventory?${query}`);
}

export async function loadAllInventory(hub: string) {
  const items: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  do {
    const page = await loadInventoryPage(hub, cursor ? { cursor } : {});
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { items, nextCursor: null };
}

export async function submitMetrics(hub: string, raw: unknown) {
  const input = metricObservationPageV2Schema.parse(raw);
  const pages = [];
  for (let offset = 0; offset < input.observations.length; offset += 100)
    pages.push(
      await api(hub, "/api/ops/metrics", {
        method: "PUT",
        body: JSON.stringify({
          observations: input.observations.slice(offset, offset + 100),
        }),
      }),
    );
  return { submitted: input.observations.length, pages };
}
