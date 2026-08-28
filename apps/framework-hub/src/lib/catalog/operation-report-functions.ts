import { createServerFn } from "@tanstack/react-start";

import { publicOperationReportQuerySchema } from "./operations-v1.contracts";
import { listPublicOperationReports } from "./operation-reports.server";
import { requireDatabase } from "@/lib/db/client";

export const loadPublicOperationReports = createServerFn({ method: "GET" })
  .validator(publicOperationReportQuerySchema)
  .handler(async ({ data, context }) => listPublicOperationReports(requireDatabase(context), data));
