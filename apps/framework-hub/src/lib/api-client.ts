import { z, type ZodType } from "zod";

const apiErrorPayloadSchema = z.object({
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
      details: z.unknown().optional(),
    })
    .optional(),
});

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type ApiRequestOptions = Omit<RequestInit, "body" | "headers"> & {
  readonly json?: unknown;
  readonly bearer?: string;
  readonly idempotencyKey?: string;
  readonly headers?: HeadersInit;
};

export async function apiRequest<T>(
  path: string,
  schema: ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("accept", "application/json");
  if (options.json !== undefined) headers.set("content-type", "application/json");
  if (options.bearer) headers.set("authorization", `Bearer ${options.bearer}`);
  if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);

  const response = await fetch(path, {
    ...options,
    credentials: options.credentials ?? "same-origin",
    headers,
    ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const payload = apiErrorPayloadSchema.safeParse(body);
    throw new ApiError(
      response.status,
      payload.success
        ? (payload.data.error?.message ?? `Request failed with HTTP ${response.status}`)
        : `Request failed with HTTP ${response.status}`,
      payload.success ? payload.data.error?.code : undefined,
      payload.success ? payload.data.error?.details : undefined,
    );
  }
  return schema.parse(body);
}

export const apiSchemas = {
  object: z.looseObject({}),
  nullableObject: z.looseObject({}).nullable(),
  itemPage: z.object({ items: z.array(z.looseObject({})) }),
  relationships: z.object({
    bookmarks: z.array(z.looseObject({})),
    pluginFollows: z.array(z.looseObject({})),
    publisherFollows: z.array(z.looseObject({})),
  }),
} as const;

export const apiKeys = {
  endpoint: (path: string) => ["api", path] as const,
  approvalList: (search: Readonly<Record<string, string | undefined>>) =>
    ["admin", "approvals", search] as const,
  approval: (id: string) => ["admin", "approval", id] as const,
  relationships: ["account", "relationships"] as const,
} as const;

export function shouldRetryApiRequest(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}
