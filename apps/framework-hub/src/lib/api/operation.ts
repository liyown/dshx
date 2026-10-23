import type { ZodType } from "zod";

import {
  publicRoute,
  tokenRoute,
  type PublicRun,
  type RouteHandler,
  type RouteSpec,
  type TokenRun,
} from "./route";

/**
 * One endpoint, declared once.
 *
 * An endpoint used to be described twice: the route module declared its path,
 * method, authentication, request and response, and a hand-written entry in
 * `api-operations.ts` declared them again for `openapi.json`, `api-docs.md` and
 * the API catalog. Nothing linked the two, so forgetting the second one did not
 * fail — four endpoint families had already fallen out of the published API
 * while still being served.
 *
 * A declaration is now the only place those facts exist. The route module
 * consumes `route(run)` to build its handler, so it cannot pick a different
 * authentication or a different contract than the one it publishes, and the
 * registry is a projection over the same objects.
 */

export type ApiOperationTag =
  "Catalog" | "Operations" | "Approvals" | "Moderation" | "CLI authorization";

export type ApiOperationMethod = "get" | "post" | "put" | "patch" | "delete";

/** What a caller must present, in the words of the API document. */
export type ApiOperationAuthentication = "none" | "bearer" | "optional-bearer";

export type ApiOperationErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 503;

/**
 * Who may call the endpoint. `bearer` reads the scope and role the token must
 * carry; `optional-bearer` authenticates inside the handler, because a rejected
 * token is a warning on that endpoint rather than a failure.
 */
export type ApiOperationAuth =
  | { readonly via: "public" }
  | {
      readonly via: "bearer";
      /** Defaults to `catalog:write`; `null` accepts any valid token. */
      readonly scope?: string | null;
      readonly role?: "moderator" | "admin";
    }
  | { readonly via: "optional-bearer" };

/** The handler a declaration accepts: the constructor's own run type. */
export type OperationRun<
  A extends ApiOperationAuth,
  TInput,
  TQuery,
  TResponse,
> = A["via"] extends "bearer"
  ? TokenRun<TInput, TQuery, TResponse>
  : PublicRun<TInput, TQuery, TResponse>;

export type ApiOperationDeclaration<
  TInput,
  TQuery,
  TResponse,
  A extends ApiOperationAuth = ApiOperationAuth,
> = {
  readonly operationId: string;
  /** The path as the API document spells it: `/api/ops/v1/changelog/{slug}`. */
  readonly path: string;
  readonly method: ApiOperationMethod;
  readonly tag: ApiOperationTag;
  readonly summary: string;
  readonly auth: A;
  /** Everything the route constructor needs, and the response contract with it. */
  readonly spec: RouteSpec<TInput, TQuery, TResponse>;
  /** What each status means, in the API document's words. */
  readonly responses: Readonly<Record<number, string>>;
  readonly errors?: readonly ApiOperationErrorStatus[];
  /** Request media type when the body is not JSON. */
  readonly contentType?: "application/json" | "multipart/form-data";
};

/** What the registry and the OpenAPI generator read. */
export type ApiOperationDefinition = {
  readonly operationId: string;
  readonly path: string;
  readonly method: ApiOperationMethod;
  readonly tag: ApiOperationTag;
  readonly summary: string;
  readonly authentication: ApiOperationAuthentication;
  readonly querySchema?: ZodType;
  readonly request?: {
    readonly schema: ZodType;
    readonly contentType?: "application/json" | "multipart/form-data";
  };
  readonly responseSchema?: ZodType;
  readonly responses: Readonly<Record<number, string>>;
  readonly errors?: readonly ApiOperationErrorStatus[];
};

export type ApiOperation<
  TInput,
  TQuery,
  TResponse,
  A extends ApiOperationAuth = ApiOperationAuth,
> = ApiOperationDefinition & {
  /** Build the route handler, in the authentication the declaration names. */
  readonly route: (run: OperationRun<A, TInput, TQuery, TResponse>) => RouteHandler;
};

export function defineOperation<
  TInput = void,
  TQuery = void,
  TResponse = unknown,
  const A extends ApiOperationAuth = { readonly via: "public" },
>(
  declaration: ApiOperationDeclaration<TInput, TQuery, TResponse, A>,
): ApiOperation<TInput, TQuery, TResponse, A> {
  const auth: ApiOperationAuth = declaration.auth;
  // The handler's contract is the spec; the request media type is part of it,
  // because the constructor has to know whether to parse a JSON body or leave
  // the bytes to the handler.
  const spec: RouteSpec<TInput, TQuery, TResponse> =
    declaration.contentType === undefined
      ? declaration.spec
      : { ...declaration.spec, contentType: declaration.contentType };
  return {
    operationId: declaration.operationId,
    path: declaration.path,
    method: declaration.method,
    tag: declaration.tag,
    summary: declaration.summary,
    authentication: auth.via === "public" ? "none" : auth.via,
    ...(spec.body === undefined
      ? {}
      : {
          request: {
            schema: spec.body,
            ...(declaration.contentType === undefined
              ? {}
              : { contentType: declaration.contentType }),
          },
        }),
    ...(spec.querySchema === undefined ? {} : { querySchema: spec.querySchema }),
    ...(spec.response === undefined ? {} : { responseSchema: spec.response }),
    responses: declaration.responses,
    ...(declaration.errors === undefined ? {} : { errors: declaration.errors }),
    // The scope and role are part of the same declaration, so the runtime gate
    // and the published security scheme cannot disagree.
    route: (run) =>
      auth.via === "bearer"
        ? tokenRoute(
            {
              ...spec,
              ...(auth.scope === undefined ? {} : { scope: auth.scope }),
              ...(auth.role === undefined ? {} : { role: auth.role }),
            },
            run as TokenRun<TInput, TQuery, TResponse>,
          )
        : publicRoute(spec, run as PublicRun<TInput, TQuery, TResponse>),
  };
}
