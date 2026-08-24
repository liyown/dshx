import { readToken } from "./keychain.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

function apiErrorMessage(body: unknown, status: number) {
  if (!body || typeof body !== "object") return `Hub returned ${status}`;
  if ("message" in body) return String((body as { message: unknown }).message);
  if ("error" in body) {
    const error = (body as { error: unknown }).error;
    if (error && typeof error === "object" && "message" in error)
      return String((error as { message: unknown }).message);
  }
  return `Hub returned ${status}`;
}

export async function api<T>(
  hub: string,
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("content-type", "application/json");
  if (authenticated) {
    const token = readToken(hub);
    if (!token)
      throw new Error("Not logged in. Run dshx-hub auth login first.");
    headers.set("authorization", `Bearer ${token}`);
  }
  const response = await fetch(new URL(path, hub), { ...init, headers });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok)
    throw new ApiError(
      response.status,
      apiErrorMessage(body, response.status),
      body,
    );
  return body as T;
}
