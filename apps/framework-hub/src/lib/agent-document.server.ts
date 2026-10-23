import { getCatalogPlugin, listCatalogDiscovery } from "./catalog/repository.server";
import { operationReportPlainText } from "./catalog/operation-report-view";
import { listPublicOperationReports } from "./catalog/operation-reports.server";
import { getPublicPublisher } from "./community/membership.server";
import { createDatabase } from "./db/client";
import type { AppRequestContext } from "./db/context";
import { isIndexable } from "./public-pages.server";
import { DOC_CHAPTERS, getDocsChapter, getDocsNavigation, isDocsSlug } from "./docs";
import type { DocsBlock } from "./docs";
import { createTranslator, isLocale, type Locale } from "./i18n";
import { aboutFacts, examples, isLegalDocument, legalDocuments } from "./public-content";
import { buildPluginInstallCommand, selectInstallTarget } from "./catalog/install-target/public";
import { article, collection, organization, pluginApplication, profilePage, website } from "./seo";
import {
  estimateMarkdownTokens,
  renderAgentDocument,
  type AgentDocument,
  type AgentDocumentBlock,
} from "./agent-document";

const SITE = "https://dshx.io";

function canonical(pathname: string): string {
  return `${SITE}${pathname}`;
}

function docsBlocks(blocks: readonly DocsBlock[]): AgentDocumentBlock[] {
  return blocks.flatMap((block): AgentDocumentBlock[] => {
    switch (block.kind) {
      case "paragraph":
      case "note":
        return [{ kind: "paragraph", text: block.text }];
      case "code":
        return [{ kind: "code", code: block.code }];
      case "terminal":
        return [
          {
            kind: "code",
            language: "console",
            code: block.lines.map((line) => line.text).join("\n"),
          },
        ];
      case "list":
        return [{ kind: "list", items: block.items }];
      case "steps":
        return [
          { kind: "list", items: block.items.map((item) => `**${item.title}:** ${item.body}`) },
        ];
      case "api":
        return [
          {
            kind: "table",
            headers: ["API", "Type", "Description"],
            rows: block.rows.map((row) => [row.name, row.type, row.body]),
          },
        ];
    }
  });
}

function staticDocument(pathname: string, locale: Locale): AgentDocument | null {
  const t = createTranslator(locale);
  if (pathname === `/${locale}`) {
    return {
      title: t("seo.title"),
      description: t("seo.description"),
      canonical: canonical(pathname),
      locale,
      sections: [
        {
          title: t("home.whyTitle"),
          blocks: [
            { kind: "paragraph", text: t("home.heroBody") },
            { kind: "paragraph", text: t("home.whyBody") },
            {
              kind: "code",
              language: "console",
              code: "pnpm create dshx my-plugin\ncd my-plugin\npnpm dev",
            },
          ],
        },
        {
          title: t("home.ecosystemTitle"),
          blocks: [{ kind: "paragraph", text: t("home.ecosystemBody") }],
        },
      ],
      references: [
        { label: "GitHub", url: "https://github.com/liyown/dshx" },
        { label: "npm", url: "https://www.npmjs.com/package/@becomeopc/dshx" },
      ],
      structuredData: [website({ locale, description: t("seo.description") }), organization()],
    };
  }
  if (pathname === `/${locale}/docs`) {
    const navigation = getDocsNavigation(locale);
    return {
      title: t("document.apiReference.title"),
      description: t("document.apiReference.description"),
      canonical: canonical(pathname),
      locale,
      sections: navigation.map((group) => ({
        title: group.label,
        blocks: [
          {
            kind: "list",
            items: group.items.map((item) => `[${item.label}](${canonical(item.href)})`),
          },
        ],
      })),
    };
  }
  const docsMatch = pathname.match(new RegExp(`^/${locale}/docs/([^/]+)$`));
  if (docsMatch && isDocsSlug(docsMatch[1])) {
    const definition = getDocsChapter(docsMatch[1]);
    const chapter = definition.copy[locale];
    return {
      title: chapter.title,
      description: chapter.description,
      canonical: canonical(pathname),
      locale,
      lastVerified: definition.lastVerified,
      sections: [
        { title: chapter.eyebrow, blocks: [{ kind: "paragraph", text: chapter.intro }] },
        ...chapter.sections.map((section) => ({
          title: section.title,
          blocks: docsBlocks(section.blocks),
        })),
      ],
      references: definition.references,
      structuredData: [
        organization(),
        article({
          locale,
          to: `/docs/${docsMatch[1]}`,
          type: "TechArticle",
          headline: chapter.title,
          description: chapter.description,
          modified: definition.lastVerified,
          partOf: "/docs",
        }),
      ],
    };
  }
  if (pathname === `/${locale}/about`) {
    return {
      title: t("about.title"),
      description: t("about.description"),
      canonical: canonical(pathname),
      locale,
      lastVerified: "2026-08-28",
      sections: [
        {
          title: t("about.boundary"),
          blocks: [{ kind: "paragraph", text: t("about.boundaryBody") }],
        },
        {
          title: t("about.evidence"),
          blocks: [
            { kind: "paragraph", text: t("about.evidenceBody") },
            {
              kind: "table",
              headers: [t("document.fact"), t("document.value")],
              rows: aboutFacts.map(({ labelKey, value }) => [t(labelKey), value]),
            },
          ],
        },
      ],
      references: [
        { label: "GitHub", url: "https://github.com/liyown/dshx" },
        { label: "npm", url: "https://www.npmjs.com/package/@becomeopc/dshx" },
      ],
    };
  }
  if (pathname === `/${locale}/examples`) {
    return {
      title: t("examples.title"),
      description: t("document.examplesDescription"),
      canonical: canonical(pathname),
      locale,
      sections: examples.map((example) => ({
        title: t(example.titleKey),
        blocks: [
          { kind: "paragraph", text: t(example.descriptionKey) },
          { kind: "code", language: "typescript", code: example.code },
        ],
      })),
    };
  }
  const legalMatch = pathname.match(new RegExp(`^/${locale}/legal/([^/]+)$`));
  if (legalMatch?.[1] && isLegalDocument(legalMatch[1])) {
    const content = legalDocuments[legalMatch[1]][locale];
    return {
      title: content.title,
      description: content.intro,
      canonical: canonical(pathname),
      locale,
      lastVerified: "2026-08-24",
      sections: content.sections.map(([title, body]) => ({
        title,
        blocks: [{ kind: "paragraph", text: body }],
      })),
      references: [{ label: t("document.securityContact"), url: "mailto:security@dshx.io" }],
    };
  }
  return null;
}

async function dynamicDocument(
  request: Request,
  locale: Locale,
  context: AppRequestContext,
): Promise<AgentDocument | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const binding = context.cloudflare.DB;
  if (!binding) return null;
  const db = createDatabase(binding);
  const t = createTranslator(locale);

  if (pathname === `/${locale}/plugins`) {
    if ([...url.searchParams].some(([, value]) => value !== "" && value !== "featured"))
      return null;
    const catalog = await listCatalogDiscovery(db, { locale, q: "", sort: "featured", limit: 24 });
    return {
      title: t("plugins.metaTitle"),
      description: t("plugins.intro"),
      canonical: canonical(pathname),
      locale,
      sections: [
        {
          title: t("plugins.title"),
          blocks: [
            { kind: "paragraph", text: t("plugins.results", { count: catalog.total }) },
            {
              kind: "table",
              headers: ["Plugin", "Version", "Compatibility", "Category", "Maintainer"],
              rows: catalog.items.map((plugin) => [
                `[${plugin.name}](${canonical(`/${locale}/plugins/${plugin.slug}`)})`,
                plugin.version,
                plugin.compat,
                plugin.category,
                plugin.author,
              ]),
            },
          ],
        },
      ],
      structuredData: [
        ...collection({
          locale,
          to: "/plugins",
          name: t("plugins.metaTitle"),
          count: catalog.total,
        }),
      ],
    };
  }

  const pluginMatch = pathname.match(new RegExp(`^/${locale}/plugins/([^/]+)$`));
  if (pluginMatch?.[1]) {
    const detail = await getCatalogPlugin(db, decodeURIComponent(pluginMatch[1]), locale);
    if (!detail || detail.redirectSlug || !detail.indexable) return null;
    const plugin = detail.plugin;
    const target = selectInstallTarget(
      detail.installTargets,
      plugin.scope,
      plugin.version,
      detail.repositoryUrl,
    );
    const install = target ? buildPluginInstallCommand(target.spec) : null;
    return {
      title: t("plugin.documentTitle", { name: plugin.name }),
      description: detail.seoDescription,
      canonical: canonical(pathname),
      locale,
      sections: [
        {
          title: t("plugin.installAndCompatibility"),
          blocks: [
            {
              kind: "table",
              headers: [t("document.fact"), t("document.value")],
              rows: [
                [t("plugin.version"), plugin.version],
                [t("plugin.compatibility"), plugin.compat],
                [t("plugin.license"), detail.license ?? t("plugin.unavailable")],
                [t("plugin.maintainer"), plugin.author],
              ],
            },
            ...(install ? [{ kind: "code" as const, language: "console", code: install }] : []),
          ],
        },
        {
          title: t("plugin.overview"),
          blocks: [{ kind: "paragraph", text: detail.overviewMarkdown ?? plugin.description }],
        },
        ...(detail.sourceReadme?.content
          ? [
              {
                title: "README",
                blocks: [
                  {
                    kind: "paragraph" as const,
                    text: detail.sourceReadme.content.slice(0, 65_536),
                  },
                ],
              },
            ]
          : []),
        {
          title: t("plugin.releasesAndDependencies"),
          blocks: [
            {
              kind: "table",
              headers: [t("plugin.version"), t("plugin.channel"), t("plugin.compatibility")],
              rows: detail.releases.map((release) => [
                release.version,
                release.channel,
                release.compatibility_range ?? "—",
              ]),
            },
            {
              kind: "list",
              items: detail.dependencies.map(
                (dependency) =>
                  `${dependency.package_name} ${dependency.version_range} (${dependency.kind})`,
              ),
            },
          ],
        },
      ],
      references: [
        ...(detail.repositoryUrl
          ? [{ label: t("plugin.repository"), url: detail.repositoryUrl }]
          : []),
        ...(detail.sourceReadme
          ? [{ label: t("document.sourceReadme"), url: detail.sourceReadme.sourceUrl }]
          : []),
      ],
      structuredData: [
        pluginApplication({
          locale,
          to: `/plugins/${plugin.slug}`,
          name: plugin.name,
          description: detail.seoDescription,
          version: plugin.version,
          compatibility: plugin.compat,
          author: plugin.author,
          sameAs: detail.repositoryUrl ? [detail.repositoryUrl] : [],
          ...(detail.rating ? { rating: detail.rating } : {}),
        }),
      ],
    };
  }

  const categoryMatch = pathname.match(new RegExp(`^/${locale}/categories/([^/]+)$`));
  if (categoryMatch?.[1]) {
    const slug = decodeURIComponent(categoryMatch[1]);
    const page = await listCatalogDiscovery(db, {
      locale,
      category: slug,
      q: "",
      sort: "featured",
      limit: 50,
    });
    const category = page.categories.find((item) => item.slug === slug);
    // The same inventory decides the page's robots and its place in the
    // sitemap; a thin category is not served to an agent either.
    if (!category || !(await isIndexable(db, { kind: "category", value: slug }, locale)))
      return null;
    return {
      title: t("document.categoryTitle", { name: category.name }),
      description: t("document.categoryDescription", { name: category.name }),
      canonical: canonical(pathname),
      locale,
      sections: [
        {
          title: category.name,
          blocks: [
            {
              kind: "list",
              items: page.items.map(
                (plugin) =>
                  `[${plugin.name}](${canonical(`/${locale}/plugins/${plugin.slug}`)}) — ${plugin.description}`,
              ),
            },
          ],
        },
      ],
    };
  }

  const publisherMatch = pathname.match(new RegExp(`^/${locale}/publishers/([^/]+)$`));
  if (publisherMatch?.[1]) {
    const result = await getPublicPublisher(db, decodeURIComponent(publisherMatch[1]), locale);
    const publisher = result.publisher;
    const login = String(publisher["login"] ?? publisherMatch[1]);
    if (login !== publisherMatch[1]) return null;
    if (!(await isIndexable(db, { kind: "publisher", value: login }, locale))) return null;
    const name = String(publisher["localized_name"] ?? login);
    const description = String(
      publisher["seo_description"] ??
        publisher["localized_bio"] ??
        t("document.publisherDescription"),
    );
    return {
      title: `${name} · DSHX Hub`,
      description,
      canonical: canonical(pathname),
      locale,
      sections: [
        {
          title: t("profile.publishedPlugins"),
          blocks: [
            {
              kind: "list",
              items: result.plugins.map(
                (plugin) =>
                  `[${String(plugin["name"])}](${canonical(`/${locale}/plugins/${String(plugin["slug"])}`)}) — ${String(plugin["description"] ?? "")}`,
              ),
            },
          ],
        },
      ],
      structuredData: [
        ...profilePage({
          locale,
          to: `/publishers/${login}`,
          name,
          description,
          entity: {
            type: publisher["kind"] === "organization" ? "Organization" : "Person",
            name,
          },
        }),
      ],
    };
  }

  if (pathname === `/${locale}/operations` && !url.searchParams.get("cursor")) {
    const reports = await listPublicOperationReports(db, { locale, limit: 20 });
    return {
      title: t("operations.metaTitle"),
      description: t("operations.intro"),
      canonical: canonical(pathname),
      locale,
      sections: reports.items.map((report) => ({
        title: `${report.day} · ${report.outcome}`,
        blocks: [
          { kind: "paragraph", text: operationReportPlainText(report.body) },
          { kind: "paragraph", text: t("document.runs", { count: report.runCount }) },
        ],
      })),
    };
  }
  return null;
}

export async function renderAgentMarkdownResponse(
  request: Request,
  context: AppRequestContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const first = url.pathname.split("/")[1];
  if ((request.method !== "GET" && request.method !== "HEAD") || !isLocale(first)) return null;
  const document =
    staticDocument(url.pathname, first) ?? (await dynamicDocument(request, first, context));
  if (!document) return null;
  const markdown = renderAgentDocument(document);
  return new Response(request.method === "HEAD" ? null : markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-length": String(new TextEncoder().encode(markdown).byteLength),
      "x-markdown-tokens": String(estimateMarkdownTokens(markdown)),
      vary: "Accept",
    },
  });
}

export const AGENT_DOCUMENT_ROUTE_COUNT = DOC_CHAPTERS.length + 9;
