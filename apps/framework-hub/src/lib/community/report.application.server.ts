import type { z } from "zod";

import type { reportCreateSchema } from "@/lib/catalog/contracts";
import type { Database } from "@/lib/db/client";
import { HttpError, uuid } from "@/lib/http";
import { sanitizeUserText } from "./contracts";
import {
  findReportByIdempotencyKey,
  insertContentReport,
  reportTargetExists,
} from "./report.repository.server";

type ReportInput = z.infer<typeof reportCreateSchema>;

export async function createContentReport(
  db: Database,
  input: ReportInput & { reporterUserId: string },
) {
  const existing = await findReportByIdempotencyKey(db, input.reporterUserId, input.idempotencyKey);
  if (existing) return { report: existing, created: false };
  if (!(await reportTargetExists(db, input.targetType, input.targetId)))
    throw new HttpError(404, "Report target does not exist", "target_not_found");
  const report = await insertContentReport(db, {
    id: uuid(),
    reporterUserId: input.reporterUserId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    details: sanitizeUserText(input.details),
    idempotencyKey: input.idempotencyKey,
  });
  return { report, created: true };
}
