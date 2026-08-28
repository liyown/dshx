import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

import { getCatalogMarketplacePlugin, listCatalogMarketplace } from "./catalog/repository.server";
import { getDocsChapter } from "./docs";
import type { DocsBlock, DocsSlug } from "./docs";
import { requireDatabase } from "./db/client";
import { requireBindings } from "./db/context";
import { MCP_SERVER_INFO } from "./mcp-card";

type CatalogSearchResult = Awaited<ReturnType<typeof listCatalogMarketplace>>;
type CatalogPluginDetail = NonNullable<Awaited<ReturnType<typeof getCatalogMarketplacePlugin>>>;

const MCP_RESOURCE_SLUGS = [
  "getting-started",
  "architecture",
  "publishing",
  "troubleshooting",
] as const satisfies readonly DocsSlug[];

export const searchPluginsArgumentsSchema = z.object({
  query: z.string().trim().max(80).default(""),
  locale: z.enum(["en", "zh"]).default("en"),
  category: z.string().trim().min(1).max(64).optional(),
  sort: z.enum(["stars", "downloads", "latest"]).default("latest"),
  limit: z.number().int().min(1).max(20).default(10),
});

export const getPluginArgumentsSchema = z.object({
  slug: z.string().trim().min(1).max(100),
  locale: z.enum(["en", "zh"]).default("en"),
});

export interface McpCatalogGateway {
  search(input: z.infer<typeof searchPluginsArgumentsSchema>): Promise<CatalogSearchResult>;
  get(slug: string, locale: "en" | "zh"): Promise<CatalogPluginDetail | null>;
}

function gatewayFor(context: unknown): McpCatalogGateway {
  const db = requireDatabase(context);
  return {
    search: (input) =>
      listCatalogMarketplace(db, {
        locale: input.locale,
        q: input.query,
        category: input.category,
        sort: input.sort,
        limit: input.limit,
      }),
    get: (slug, locale) => getCatalogMarketplacePlugin(db, slug, locale),
  };
}

function lazyGatewayFor(context: unknown): McpCatalogGateway {
  return {
    search: (input) => gatewayFor(context).search(input),
    get: (slug, locale) => gatewayFor(context).get(slug, locale),
  };
}

function at(origin: string, path: string): string {
  return new URL(path, `${new URL(origin).origin}/`).href;
}

function mcpOrigin(request: Request, context: unknown): string {
  let configured: string | undefined;
  try {
    configured = requireBindings(context).SITE_URL;
  } catch {
    configured = undefined;
  }
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

function renderBlock(block: DocsBlock): string {
  switch (block.kind) {
    case "paragraph":
      return block.text;
    case "code":
      return `\`\`\`${block.title}\n${block.code}\n\`\`\``;
    case "terminal":
      return `\`\`\`console\n${block.lines.map((line) => line.text).join("\n")}\n\`\`\``;
    case "note":
      return `> ${block.text}`;
    case "list":
      return block.items.map((item) => `- ${item}`).join("\n");
    case "steps":
      return block.items
        .map((item, index) => `${index + 1}. **${item.title}** — ${item.body}`)
        .join("\n");
    case "api":
      return [
        "| Name | Type | Description |",
        "| --- | --- | --- |",
        ...block.rows.map(
          (row) =>
            `| ${row.name.replaceAll("|", "\\|")} | ${row.type.replaceAll("|", "\\|")} | ${row.body.replaceAll("|", "\\|")} |`,
        ),
      ].join("\n");
  }
}

function renderDocsResource(slug: DocsSlug, locale: "en" | "zh", origin: string): string {
  const chapter = getDocsChapter(slug);
  const copy = chapter.copy[locale];
  const sections = copy.sections
    .map((section) => `## ${section.title}\n\n${section.blocks.map(renderBlock).join("\n\n")}`)
    .join("\n\n");
  const references = chapter.references
    .map((reference) => `- [${reference.label}](${reference.url})`)
    .join("\n");
  return `# ${copy.title}\n\n${copy.intro}\n\n${copy.description}\n\nVerified: ${chapter.lastVerified}\n\n${sections}\n\n## References\n\n${references}\n\nCanonical page: ${at(origin, `/${locale}/docs/${slug}`)}\n`;
}

function resourceUri(slug: DocsSlug, locale: "en" | "zh"): string {
  return `dshx://docs/${slug}?locale=${locale}`;
}

function toolResult(structuredContent: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

function createDshxMcpServer(origin: string, gateway: McpCatalogGateway): McpServer {
  const server = new McpServer(MCP_SERVER_INFO, {
    capabilities: { tools: {}, resources: {} },
    instructions:
      "Use search_plugins before get_plugin. This server is public and read-only; validate installation targets before installing third-party code.",
  });

  server.registerTool(
    "search_plugins",
    {
      title: "Search installable DSH plugins",
      description:
        "Search the public DSHX Hub marketplace. Results are limited to published plugins with a unique active install target.",
      inputSchema: searchPluginsArgumentsSchema,
    },
    async (input) => {
      const result = await gateway.search(input);
      return toolResult({
        ...result,
        items: result.items.map((plugin) => ({
          ...plugin,
          url: at(origin, `/${input.locale}/plugins/${plugin.slug}`),
        })),
      });
    },
  );

  server.registerTool(
    "get_plugin",
    {
      title: "Get an installable DSH plugin",
      description:
        "Return version, compatibility, installation targets, source provenance, releases, and documentation for one installable plugin.",
      inputSchema: getPluginArgumentsSchema,
    },
    async (input) => {
      const detail = await gateway.get(input.slug, input.locale);
      if (!detail) {
        return {
          content: [{ type: "text" as const, text: "Plugin not found or not installable" }],
          isError: true,
        };
      }
      const readme = detail.sourceReadme;
      const readmeContent = readme?.content ?? null;
      return toolResult({
        plugin: detail.plugin,
        url: at(origin, `/${input.locale}/plugins/${detail.plugin.slug}`),
        lifecycleStatus: detail.lifecycleStatus,
        license: detail.license,
        homepageUrl: detail.homepageUrl,
        repositoryUrl: detail.repositoryUrl,
        overviewMarkdown: detail.overviewMarkdown,
        installNotesMarkdown: detail.installNotesMarkdown,
        installTargets: detail.installTargets,
        releases: detail.releases,
        dependencies: detail.dependencies,
        categories: detail.categories,
        capabilities: detail.capabilities,
        sourceReadme: readme
          ? {
              ...readme,
              content: readmeContent?.slice(0, 64 * 1024) ?? null,
              truncated: readmeContent !== null && readmeContent.length > 64 * 1024,
            }
          : null,
      });
    },
  );

  for (const slug of MCP_RESOURCE_SLUGS) {
    const chapter = getDocsChapter(slug);
    for (const locale of ["en", "zh"] as const) {
      const uri = resourceUri(slug, locale);
      server.registerResource(
        `${slug}-${locale}`,
        uri,
        {
          title: chapter.copy[locale].title,
          description: chapter.copy[locale].description,
          mimeType: "text/markdown",
        },
        async () => ({
          contents: [
            {
              uri,
              mimeType: "text/markdown",
              text: renderDocsResource(slug, locale, origin),
            },
          ],
        }),
      );
    }
  }
  return server;
}

function requestWithinLimit(request: Request): boolean {
  const length = Number(request.headers.get("content-length") ?? 0);
  return !Number.isFinite(length) || length <= 64 * 1024;
}

export async function serveMcp(
  request: Request,
  context: unknown,
  gateway?: McpCatalogGateway,
): Promise<Response> {
  if (!requestWithinLimit(request)) {
    return new Response("MCP request body is too large", { status: 413 });
  }
  let boundedRequest = request;
  if (request.method === "POST" && !request.headers.has("content-length")) {
    const body = await request.arrayBuffer();
    if (body.byteLength > 64 * 1024) {
      return new Response("MCP request body is too large", { status: 413 });
    }
    boundedRequest = new Request(request, { body });
  }
  const origin = mcpOrigin(request, context);
  const hostname = new URL(request.url).hostname;
  const handler = createMcpHandler(
    () => createDshxMcpServer(origin, gateway ?? lazyGatewayFor(context)),
    {
      route: "/mcp",
      legacy: "stateless",
      responseMode: "json",
      allowedHostnames: ["dshx.io", "localhost", "127.0.0.1", hostname],
      allowedOriginHostnames: ["dshx.io", "localhost", "127.0.0.1"],
      corsOptions: {
        origin: "*",
        methods: "POST, OPTIONS",
        headers: "Content-Type, MCP-Protocol-Version",
        maxAge: 86_400,
      },
      onerror(error) {
        console.error("MCP request failed", error);
      },
    },
  );
  return handler.fetch(boundedRequest);
}
