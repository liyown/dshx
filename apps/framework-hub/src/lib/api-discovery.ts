import { z, type ZodType } from "zod";

import {
  API_OPERATION_DEFINITIONS,
  type ApiOperationDefinition,
  type ApiOperationTag,
  operationsForTag,
} from "./api-operations";
import {
  API_CATALOG_MEDIA_TYPE,
  API_CATALOG_PROFILE,
  OPENAPI_MEDIA_TYPE,
} from "./discovery-link-headers";

export { API_CATALOG_MEDIA_TYPE, API_CATALOG_PROFILE, OPENAPI_MEDIA_TYPE };

type LinkTarget = {
  readonly href: string;
  readonly type: string;
};

export type ApiCatalogEntry = {
  readonly anchor: string;
  readonly "service-desc": readonly LinkTarget[];
  readonly "service-doc": readonly LinkTarget[];
  readonly status?: readonly LinkTarget[];
};

export type ApiCatalogDocument = {
  readonly linkset: readonly ApiCatalogEntry[];
};

const TAG_DESCRIPTIONS: Readonly<Record<ApiOperationTag, string>> = {
  Catalog: "Read-only public DSH plugin discovery.",
  Operations:
    "Atomic catalog maintenance operations. All endpoints except status require a bearer token with catalog:write scope.",
  "CLI authorization": "Browser-assisted authorization and token lifecycle for the DSHX Hub CLI.",
};

const ERROR_RESPONSE_NAMES = {
  400: "BadRequest",
  401: "Unauthorized",
  404: "NotFound",
  409: "Conflict",
  422: "Unprocessable",
} as const;

const ERROR_RESPONSE_DESCRIPTIONS = {
  BadRequest: "The request did not satisfy the endpoint contract.",
  Unauthorized: "A valid bearer token and required scope are missing.",
  NotFound: "The requested resource does not exist.",
  Conflict: "The request conflicts with the current resource revision.",
  Unprocessable: "The JSON is valid but fails a domain contract.",
} as const;

function normalizeOrigin(origin: string): string {
  return new URL(origin).origin;
}

function at(origin: string, path: string): string {
  return new URL(path, `${normalizeOrigin(origin)}/`).href;
}

function schemaToOpenApi(schema: ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    unrepresentable: "any",
    reused: "inline",
    cycles: "ref",
  }) as Record<string, unknown>;
  const { $schema: _schema, ...openApiSchema } = generated;
  return openApiSchema;
}

function queryParameters(schema: ZodType | undefined): readonly Record<string, unknown>[] {
  if (!schema) return [];
  const jsonSchema = schemaToOpenApi(schema);
  const properties = (jsonSchema["properties"] ?? {}) as Record<string, Record<string, unknown>>;
  const requiredValue = jsonSchema["required"];
  const required = new Set(Array.isArray(requiredValue) ? requiredValue : []);
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: "query",
    required: required.has(name),
    schema: property,
    ...(property["type"] === "array" ? { style: "form", explode: true } : {}),
  }));
}

function pathParameters(path: string): readonly Record<string, unknown>[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string", minLength: 1 },
  }));
}

function operationResponses(operation: ApiOperationDefinition): Record<string, unknown> {
  const responses: Record<string, unknown> = {};
  for (const [status, description] of Object.entries(operation.responses)) {
    const statusNumber = Number(status);
    responses[status] = {
      description,
      ...(operation.responseSchema &&
      statusNumber >= 200 &&
      statusNumber < 300 &&
      statusNumber !== 204
        ? {
            content: {
              "application/json": { schema: schemaToOpenApi(operation.responseSchema) },
            },
          }
        : {}),
    };
  }
  for (const status of operation.errors ?? []) {
    responses[String(status)] = {
      $ref: `#/components/responses/${ERROR_RESPONSE_NAMES[status]}`,
    };
  }
  return responses;
}

function operationSecurity(authentication: ApiOperationDefinition["authentication"]) {
  if (authentication === "bearer") return [{ bearerAuth: [] }];
  if (authentication === "optional-bearer") return [{ bearerAuth: [] }, {}];
  return undefined;
}

function openApiOperation(operation: ApiOperationDefinition): Record<string, unknown> {
  const parameters = [...pathParameters(operation.path), ...queryParameters(operation.querySchema)];
  const security = operationSecurity(operation.authentication);
  return {
    operationId: operation.operationId,
    tags: [operation.tag],
    summary: operation.summary,
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(security ? { security } : {}),
    ...(operation.request
      ? {
          requestBody: {
            required: true,
            content: {
              [operation.request.contentType ?? "application/json"]: {
                schema: schemaToOpenApi(operation.request.schema),
              },
            },
          },
        }
      : {}),
    responses: operationResponses(operation),
  };
}

function openApiPaths(): Record<string, Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of API_OPERATION_DEFINITIONS) {
    const path = (paths[operation.path] ??= {});
    path[operation.method] = openApiOperation(operation);
  }
  return paths;
}

export function buildOpenApiDocument(origin: string) {
  const serverUrl = normalizeOrigin(origin);
  const jsonErrorSchema = {
    type: "object",
    additionalProperties: true,
  } as const;
  return {
    openapi: "3.1.0",
    info: {
      title: "DSHX Hub API",
      version: "1.0.0",
      description:
        "Public discovery endpoints for the DSH plugin catalog and authenticated atomic operations used by the DSHX Hub CLI.",
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: serverUrl }],
    externalDocs: {
      description: "DSHX Hub API documentation",
      url: at(origin, "/api-docs.md"),
    },
    tags: (Object.keys(TAG_DESCRIPTIONS) as ApiOperationTag[]).map((name) => ({
      name,
      description: TAG_DESCRIPTIONS[name],
    })),
    paths: openApiPaths(),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "opaque",
          description: "Token issued by the DSHX Hub CLI authorization flow.",
        },
      },
      responses: Object.fromEntries(
        Object.entries(ERROR_RESPONSE_DESCRIPTIONS).map(([name, description]) => [
          name,
          {
            description,
            content: { "application/json": { schema: jsonErrorSchema } },
          },
        ]),
      ),
    },
  } as const;
}

function catalogEntry(
  origin: string,
  tag: "Catalog" | "Operations",
  anchorOperationId: string,
  statusPath: string,
): ApiCatalogEntry {
  const anchor = API_OPERATION_DEFINITIONS.find(
    (operation) => operation.tag === tag && operation.operationId === anchorOperationId,
  );
  if (!anchor) throw new Error(`Missing API catalog anchor operation: ${anchorOperationId}`);
  return {
    anchor: at(origin, anchor.path),
    "service-desc": [{ href: at(origin, "/openapi.json"), type: OPENAPI_MEDIA_TYPE }],
    "service-doc": [
      {
        href: at(origin, `/api-docs.md#${tag === "Catalog" ? "catalog-api" : "operations-api"}`),
        type: "text/markdown",
      },
    ],
    status: [{ href: at(origin, statusPath), type: "application/json" }],
  };
}

export function buildApiCatalog(origin: string): ApiCatalogDocument {
  return {
    linkset: [
      catalogEntry(origin, "Catalog", "listCatalogPlugins", "/api/health"),
      catalogEntry(origin, "Operations", "getOperationsStatus", "/api/ops/v1/status"),
    ],
  };
}

function operationLine(operation: ApiOperationDefinition): string {
  return `- \`${operation.method.toUpperCase()} ${operation.path}\` — ${operation.summary}.`;
}

function operationSection(tag: ApiOperationTag, extra: string): string {
  const lines = operationsForTag(tag).map(operationLine).join("\n");
  return `## ${tag === "CLI authorization" ? "CLI Authorization" : `${tag} API`}\n\n${TAG_DESCRIPTIONS[tag]} ${extra}\n\n${lines}`;
}

export function buildApiDocs(origin: string): string {
  const site = normalizeOrigin(origin);
  return `# DSHX Hub API

The DSHX Hub exposes public catalog discovery, authenticated atomic operations, and browser-assisted CLI authorization. The machine-readable OpenAPI 3.1 description is available at ${site}/openapi.json.

${operationSection(
  "Catalog",
  "It does not require authentication. Pagination cursors are opaque and must not be constructed by clients.",
)}

${operationSection(
  "Operations",
  "Except for the status endpoint, send an HTTP Bearer token with the catalog:write scope. Mutations are independently retryable and may return 409 for revision conflicts or 422 for domain contract failures.",
)}

${operationSection(
  "CLI authorization",
  "Use the registration and exchange endpoints documented in auth.md. Do not automate the human GitHub approval step.",
)}

## Discovery

- API catalog: ${site}/.well-known/api-catalog
- OpenAPI 3.1: ${site}/openapi.json
- Authentication: ${site}/auth.md
- Human plugin directory: ${site}/en/plugins
- Public operations log: ${site}/en/operations
- Source operations contract: https://github.com/liyown/dshx/blob/main/apps/framework-hub/OPERATIONS.md
`;
}
