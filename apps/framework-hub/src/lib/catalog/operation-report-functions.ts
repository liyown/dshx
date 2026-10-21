import { createServerFn } from "@tanstack/react-start";

import {
  publicOperationReportDetailQuerySchema,
  publicOperationReportQuerySchema,
} from "./operations-v1.contracts";
import { getPublicOperationReportDetail } from "./operation-report-detail.server";
import { listPublicOperationReports } from "./operation-reports.server";
import { requireDatabase } from "@/lib/db/client";

export const loadPublicOperationReports = createServerFn({ method: "GET" })
  .validator(publicOperationReportQuerySchema)
  .handler(async ({ data, context }) => listPublicOperationReports(requireDatabase(context), data));

export const loadPublicOperationReport = createServerFn({ method: "GET" })
  .validator(publicOperationReportDetailQuerySchema)
  .handler(async ({ data, context }) =>
    getPublicOperationReportDetail(requireDatabase(context), data.runId, data.locale),
  );
