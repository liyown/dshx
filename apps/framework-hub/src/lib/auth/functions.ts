import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireAdminSession } from "./auth.server";
import { HttpError } from "@/lib/http";

export const hasAdminAccess = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  try {
    await requireAdminSession(getRequest(), context);
    return true;
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) return false;
    throw error;
  }
});
