import { z, type ZodType } from "zod";

import { requireAdminSession, requireSameOrigin, requireSession } from "@/lib/auth/auth.server";
import { authenticateApiToken, requireApiToken } from "@/lib/auth/tokens.server";
import {
  operationFailure,
  operationRequestId,
  operationSuccess,
  parseOperationInput,
  readOperationJson,
} from "@/lib/catalog/operations-v1.http";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { requireDatabase } from "@/lib/db/client";
import { HttpError, jsonError, readJson } from "@/lib/http";

/**
 * Every route under `/api/**` is one of four kinds, and they differ only in who
 * may call it: `publicRoute`, `sessionRoute`, `adminRoute`, `tokenRoute`. This
 * module owns what all of them share — reading the body, validating the query,
 * rendering success and failure, turning an exception into the endpoint's
 * response envelope, and the order authentication, validation and the community
 * guard run in — so a handler is left with mapping input to a call.
 *
 * The envelope is a property of the endpoint (`envelope: "operation"` for the
 * versioned Operations API, `"api"` everywhere else), never of the directory
 * the route happens to live in.
 *
 * Six endpoints are protocol adapters rather than API handlers and stay outside
 * this module: `auth/$` (better-auth's own router), `cli/authorizations/$id/approve`
 * (HTML sign-in page), `health` (probe bodies), `config` (no request input),
 * `github-stars` (edge cache proxy) and `media/$id` (binary responses).
 */

export type Envelope = "api" | "operation";

/**
 * TanStack types each route's params from its own path, but a handler is written
 * against this module before the router checks it, and nothing here reads a
 * param by name. Treating the bag as opaque keeps the route file's own params
 * type — not an index signature — the thing that names the keys.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteParams = any;

export interface RouteArgs<P = RouteParams> {
  readonly request: Request;
  readonly context: unknown;
  readonly params: P;
}

export interface RouteSpec<TInput = void, TQuery = void, TResponse = unknown> {
  /** JSON body contract. Parse failures are the endpoint's 400/422, not the handler's. */
  readonly body?: ZodType<TInput>;
  /** Reads query parameters into the shape `querySchema` validates. */
  readonly query?: (params: URLSearchParams) => unknown;
  /** Query contract, validated after `query` shapes the values. */
  readonly querySchema?: ZodType<TQuery>;
  /**
   * Response contract, shared with the client that reads this endpoint. Declaring
   * it types the handler's return value: the handler cannot answer a shape the
   * contract does not describe, and the client cannot read a shape the handler
   * does not send. The service layer behind the handler is type-checked against
   * it too, which is where drift would otherwise start.
   */
  readonly response?: ZodType<TResponse>;
  /** Which response envelope this endpoint speaks. Defaults to `api`. */
  readonly envelope?: Envelope;
  /** Success status. Defaults to 200. */
  readonly status?: number;
  /** Headers every response from this endpoint carries, failures included. */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface SessionSpec<TInput = void, TQuery = void, TResponse = unknown> extends RouteSpec<
  TInput,
  TQuery,
  TResponse
> {
  /**
   * The community write to charge for. When set, the session, the body and the
   * community guard always run in that order, so a write cannot skip its guard.
   */
  readonly community?: string;
}

export interface TokenSpec<TInput = void, TQuery = void, TResponse = unknown> extends RouteSpec<
  TInput,
  TQuery,
  TResponse
> {
  /**
   * Required token scope. Defaults to `catalog:write`, the scope of the
   * Operations API; `null` accepts any valid token and leaves the gate to `role`.
   */
  readonly scope?: string | null;
  /** Additional role gate on top of the scope. */
  readonly role?: "moderator" | "admin";
}

type SessionActor = Awaited<ReturnType<typeof requireSession>>;
type AdminActor = Awaited<ReturnType<typeof requireAdminSession>>;
type TokenActor = Awaited<ReturnType<typeof requireApiToken>>;

/**
 * A handler answers its contract, or a Response of its own when it needs bytes,
 * a redirect or headers the spec cannot express.
 */
type Answer<TResponse> = TResponse | Response;

type Run<TArgs, TResult> = (args: TArgs) => TResult | Promise<TResult>;

type SessionRun<TInput, TQuery, TResponse> = Run<
  RouteArgs & SessionActor & { readonly input: TInput; readonly query: TQuery },
  Answer<TResponse>
>;
type TokenRun<TInput, TQuery, TResponse> = Run<
  RouteArgs &
    TokenActor & {
      readonly db: Awaited<ReturnType<typeof requireDatabase>>;
      readonly input: TInput;
      readonly query: TQuery;
    },
  Answer<TResponse>
>;
type PublicRun<TInput, TQuery, TResponse> = Run<
  RouteArgs & {
    readonly db: ReturnType<typeof requireDatabase>;
    readonly input: TInput;
    readonly query: TQuery;
  },
  Answer<TResponse>
>;

export type RouteHandler = (args: RouteArgs) => Promise<Response>;

/** Public read endpoints read `?locale=` as Chinese-or-English, defaulting to English. */
export const localeQuery = {
  query: (params: URLSearchParams) => ({ locale: params.get("locale") === "zh" ? "zh" : "en" }),
  querySchema: z.object({ locale: z.enum(["en", "zh"]) }),
} as const satisfies RouteSpec<void, { readonly locale: "en" | "zh" }>;

/** Repeated, comma-separated values of one query parameter, or undefined when none. */
export function listQuery(params: URLSearchParams, name: string): string[] | undefined {
  const values = [
    ...new Set(
      params
        .getAll(name)
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  return values.length === 0 ? undefined : values;
}

export interface RouteMeta {
  /** Success status, when the handler decides it at runtime. */
  readonly status?: number;
  /** Operation-envelope warnings that describe a success with caveats. */
  readonly warnings?: readonly unknown[];
}

const metaKey = Symbol("routeMeta");

interface MetaResult<T> {
  readonly [metaKey]: RouteMeta;
  readonly data: T;
}

/**
 * Decorate a handler result with the status or warnings only the handler knows.
 * The result keeps its type, so a handler can return `withMeta(value, { status })`
 * wherever it would return `value`.
 */
export function withMeta<T>(value: T, meta: RouteMeta): T {
  return { [metaKey]: meta, data: value } as unknown as T;
}

const DEFAULT_SCOPE = "catalog:write";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Whether this request may write at all.
 *
 * A browser attaches `Origin` to every unsafe method, so a request that names
 * another origin is one a page made on the visitor's behalf, carrying their
 * cookie. Every constructor that admits a browser credential runs this before
 * the body is read; no route opts in or out, because the rule is the same for
 * all of them.
 */
function requireOwnOrigin(request: Request, context: unknown): void {
  if (!SAFE_METHODS.has(request.method)) requireSameOrigin(request, context);
}

export function publicRoute<TInput = void, TQuery = void, TResponse = unknown>(
  spec: RouteSpec<TInput, TQuery, TResponse>,
  run: PublicRun<TInput, TQuery, NoInfer<TResponse>>,
): RouteHandler {
  return async (args) => {
    try {
      requireOwnOrigin(args.request, args.context);
      const input = await readBody(args.request, spec);
      const query = readQuery(spec, args.request);
      return await respond(args, spec, () =>
        run({ ...args, db: requireDatabase(args.context), input, query }),
      );
    } catch (error) {
      return fail(args.request, error, spec);
    }
  };
}

export function sessionRoute<TInput = void, TQuery = void, TResponse = unknown>(
  spec: SessionSpec<TInput, TQuery, TResponse>,
  run: SessionRun<TInput, TQuery, NoInfer<TResponse>>,
): RouteHandler {
  return async (args) => {
    try {
      requireOwnOrigin(args.request, args.context);
      const actor = await requireSession(args.request, args.context);
      const input = await readBody(args.request, spec);
      if (spec.community !== undefined)
        await requireCommunityWrite(
          args.request,
          args.context,
          actor.db,
          actor.session.user.id,
          spec.community,
          turnstileToken(input),
        );
      const query = readQuery(spec, args.request);
      return await respond(args, spec, () => run({ ...args, ...actor, input, query }));
    } catch (error) {
      return fail(args.request, error, spec);
    }
  };
}

export function adminRoute<TInput = void, TQuery = void, TResponse = unknown>(
  spec: RouteSpec<TInput, TQuery, TResponse>,
  run: SessionRun<TInput, TQuery, NoInfer<TResponse>>,
): RouteHandler {
  return async (args) => {
    try {
      requireOwnOrigin(args.request, args.context);
      const actor: AdminActor = await requireAdminSession(args.request, args.context);
      const input = await readBody(args.request, spec);
      const query = readQuery(spec, args.request);
      return await respond(args, spec, () => run({ ...args, ...actor, input, query }));
    } catch (error) {
      return fail(args.request, error, spec);
    }
  };
}

export function tokenRoute<TInput = void, TQuery = void, TResponse = unknown>(
  spec: TokenSpec<TInput, TQuery, TResponse>,
  run: TokenRun<TInput, TQuery, NoInfer<TResponse>>,
): RouteHandler {
  return async (args) => {
    try {
      const db = requireDatabase(args.context);
      const actor: TokenActor =
        spec.scope === null
          ? await authenticateApiToken(db, args.request)
          : await requireApiToken(db, args.request, spec.scope ?? DEFAULT_SCOPE);
      requireRole(actor, spec.role);
      const input = await readBody(args.request, spec);
      const query = readQuery(spec, args.request);
      return await respond(args, spec, () => run({ ...args, ...actor, db, input, query }));
    } catch (error) {
      return fail(args.request, error, spec);
    }
  };
}

function requireRole(actor: TokenActor, role: TokenSpec["role"]): void {
  if (role === undefined) return;
  if (role === "admin" && actor.profile.role !== "admin")
    throw new HttpError(403, "Administrator role required", "admin_required");
  if (role === "moderator" && !["moderator", "admin"].includes(actor.profile.role))
    throw new HttpError(403, "Moderator role required", "forbidden");
}

async function respond<TInput, TQuery>(
  args: RouteArgs,
  spec: RouteSpec<TInput, TQuery>,
  run: () => unknown,
): Promise<Response> {
  try {
    const value = await run();
    // A handler that needs bytes, a redirect, a 204, or headers of its own
    // returns the Response itself; everything else is rendered from the spec.
    if (value instanceof Response) return value;
    return succeed(args.request, value, spec);
  } catch (error) {
    return fail(args.request, error, spec);
  }
}

// `respond` renders failures thrown by the handler body; the route constructors
// catch failures from authentication and input parsing before it.
function succeed<TInput, TQuery>(
  request: Request,
  value: unknown,
  spec: RouteSpec<TInput, TQuery>,
): Response {
  const decorated = isMetaResult(value) ? value : undefined;
  const data = decorated === undefined ? value : decorated.data;
  const status = decorated?.[metaKey].status ?? spec.status;
  const warnings = decorated?.[metaKey].warnings;
  const response =
    spec.envelope === "operation"
      ? operationSuccess(request, data, {
          ...(status === undefined ? {} : { status }),
          ...(warnings === undefined ? {} : { warnings: [...warnings] }),
          requestId: operationRequestId(request),
        })
      : Response.json(data, status === undefined ? {} : { status });
  return applyHeaders(response, spec.headers);
}

function fail<TInput, TQuery>(
  request: Request,
  error: unknown,
  spec: RouteSpec<TInput, TQuery>,
): Response {
  const response =
    spec.envelope === "operation"
      ? operationFailure(request, error, operationRequestId(request))
      : jsonError(error);
  return applyHeaders(response, spec.headers);
}

function applyHeaders(response: Response, headers: RouteSpec["headers"]): Response {
  if (headers !== undefined)
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

function isMetaResult(value: unknown): value is MetaResult<unknown> {
  return typeof value === "object" && value !== null && metaKey in value;
}

async function readBody<TInput, TQuery>(
  request: Request,
  spec: RouteSpec<TInput, TQuery>,
): Promise<TInput> {
  if (spec.body === undefined) return undefined as TInput;
  return spec.envelope === "operation"
    ? await readOperationJson(request, spec.body)
    : await readJson(request, spec.body);
}

function readQuery<TInput, TQuery>(spec: RouteSpec<TInput, TQuery>, request: Request): TQuery {
  if (spec.querySchema === undefined && spec.query === undefined) return undefined as TQuery;
  const search = new URL(request.url).searchParams;
  // A route may shape the query without a schema when the shape is the whole
  // contract; a schema then validates whatever the shape produced.
  const shaped = spec.query === undefined ? Object.fromEntries(search) : spec.query(search);
  if (spec.querySchema === undefined) return shaped as TQuery;
  if (spec.envelope === "operation") return parseOperationInput(spec.querySchema, shaped);
  const parsed = spec.querySchema.safeParse(shaped);
  if (parsed.success) return parsed.data;
  throw new HttpError(
    422,
    parsed.error.issues.map((issue) => issue.message).join("; "),
    "invalid_query",
    parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  );
}

function turnstileToken(input: unknown): string {
  if (input === null || typeof input !== "object" || !("turnstileToken" in input)) return "";
  const value = (input as { turnstileToken?: unknown }).turnstileToken;
  return typeof value === "string" ? value : "";
}
