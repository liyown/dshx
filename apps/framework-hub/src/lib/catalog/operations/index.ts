/**
 * The operations API, as the routes and tests see it.
 *
 * Callers outside `operations/` import from this file, never from a module
 * inside it, so the internals can move without touching thirteen route files.
 * Inside, the dependencies only point one way: `store` → `plugins/policy` →
 * reads/curation/submissions/audit.
 */

export { auditOperations } from "./audit.server";
export {
  expectedObservationId,
  operationIdentityKey,
  upsertObservation,
  upsertObservationBatch,
} from "./observation/ingest.server";
export { curatePlugin, setPluginVisibility } from "./plugins/curation.server";
export { getOpsPlugin, getOpsStatus, listOpsPlugins } from "./plugins/reads.server";
export { getOpsSubmission, listOpsSubmissions, resolveOpsSubmission } from "./submissions.server";
