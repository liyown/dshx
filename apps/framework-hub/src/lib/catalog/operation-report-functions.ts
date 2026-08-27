import { createServerFn } from "@tanstack/react-start";

import { publicOperationReportQuerySchema } from "./operations-v1.contracts";
import { listPublicOperationReports } from "./operation-reports.server";
import { requireD1 } from "@/lib/db/client";

export const loadPublicOperationReports = createServerFn({ method: "GET" })
  .validator(publicOperationReportQuerySchema)
  .handler(async ({ data, context }) => listPublicOperationReports(requireD1(context), data));
