import { createServerFn } from "@tanstack/react-start";

import {
  getOperationReportDayForRun,
  getPublicOperationReportDay,
} from "./operation-report-detail.server";
import { listPublicOperationReports } from "./operation-reports.server";
import { requireDatabase } from "@/lib/db/client";
import {
  publicOperationReportDayQuerySchema,
  publicOperationReportQuerySchema,
  publicOperationReportRunQuerySchema,
} from "@becomeopc/dshx-hub-contracts";

export const loadPublicOperationReports = createServerFn({ method: "GET" })
  .validator(publicOperationReportQuerySchema)
  .handler(async ({ data, context }) => listPublicOperationReports(requireDatabase(context), data));

export const loadPublicOperationReportDay = createServerFn({ method: "GET" })
  .validator(publicOperationReportDayQuerySchema)
  .handler(async ({ data, context }) =>
    getPublicOperationReportDay(requireDatabase(context), data.day, data.locale),
  );

export const loadOperationReportDayForRun = createServerFn({ method: "GET" })
  .validator(publicOperationReportRunQuerySchema)
  .handler(async ({ data, context }) =>
    getOperationReportDayForRun(requireDatabase(context), data.runId),
  );
