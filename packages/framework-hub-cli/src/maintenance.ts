import { api } from "./api.js";

export async function runMaintenanceAudit(
  hub: string,
  scope: "daily" | "full",
) {
  return api(hub, `/api/ops/maintenance/audit?scope=${scope}`);
}
