import { getCatalogPlugin, listCatalogDiscovery } from "./catalog/repository.server";
import { listPublicOperationReports } from "./catalog/operation-reports.server";
import { getPublicPublisher } from "./community/marketplace.server";
import { createDatabase } from "./db/client";
import type { AppRequestContext } from "./db/context";
import { DOC_CHAPTERS, getDocsChapter, getDocsNavigation, isDocsSlug } from "./docs";
import type { DocsBlock } from "./docs";
import { createTranslator, isLocale, type Locale } from "./i18n";
import { aboutCopy, examples, isLegalDocument, legalDocuments } from "./public-content";
import { buildPluginInstallCommand, selectInstallTarget } from "./catalog/install-target";
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
      structuredData: [
        { "@id": `${SITE}/#website`, "@type": "WebSite", name: "DSHX", url: SITE },
        { "@id": `${SITE}/#organization`, "@type": "Organization", name: "DSHX", url: SITE },
      ],
    };
  }
  if (pathname === `/${locale}/docs`) {
    const navigation = getDocsNavigation(locale);
    const title = locale === "zh" ? "DSHX API 参考" : "DSHX API Reference";
    const description =
      locale === "zh"
        ? "DSHX Host、Client、Settings、类型化 API、Compiler、CLI 与兼容性参考。"
        : "Reference for DSHX Host, Client, Settings, typed APIs, compiler, CLI, and compatibility.";
    return {
      title,
      description,
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
        { "@type": "TechArticle", headline: chapter.title, dateModified: definition.lastVerified },
      ],
    };
  }
  if (pathname === `/${locale}/about`) {
    const content = aboutCopy[locale];
    return {
      title: content.title,
      description: content.description,
      canonical: canonical(pathname),
      locale,
      lastVerified: "2026-08-28",
      sections: [
        { title: content.boundary, blocks: [{ kind: "paragraph", text: content.boundaryBody }] },
        {
          title: content.evidence,
          blocks: [
            { kind: "paragraph", text: content.evidenceBody },
            { kind: "table", headers: ["Fact", "Value"], rows: content.facts },
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
      description:
        locale === "zh"
          ? "DSHX 插件的完整、聚焦示例。"
          : "Focused DSHX plugin examples with complete source.",
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
      references: [{ label: "Security contact", url: "mailto:security@dshx.io" }],
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
        { "@type": "CollectionPage", name: t("plugins.metaTitle"), numberOfItems: catalog.total },
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
      title: locale === "zh" ? `${plugin.name} DSH 插件` : `${plugin.name} DSH Plugin`,
      description: detail.seoDescription,
      canonical: canonical(pathname),
      locale,
      sections: [
        {
          title: locale === "zh" ? "安装与兼容性" : "Installation and compatibility",
          blocks: [
            {
              kind: "table",
              headers: ["Fact", "Value"],
              rows: [
                [locale === "zh" ? "版本" : "Version", plugin.version],
                [locale === "zh" ? "兼容性" : "Compatibility", plugin.compat],
                [locale === "zh" ? "许可证" : "License", detail.license ?? "Unavailable"],
                [locale === "zh" ? "维护者" : "Maintainer", plugin.author],
              ],
            },
            ...(install ? [{ kind: "code" as const, language: "console", code: install }] : []),
          ],
        },
        {
          title: locale === "zh" ? "概览" : "Overview",
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
          title: locale === "zh" ? "发布与依赖" : "Releases and dependencies",
          blocks: [
            {
              kind: "table",
              headers: ["Version", "Channel", "Compatibility"],
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
        ...(detail.repositoryUrl ? [{ label: "Repository", url: detail.repositoryUrl }] : []),
        ...(detail.sourceReadme
          ? [{ label: "Source README", url: detail.sourceReadme.sourceUrl }]
          : []),
      ],
      structuredData: [
        {
          "@type": "SoftwareApplication",
          name: plugin.name,
          softwareVersion: plugin.version,
          softwareRequirements: `DeepSeek Harness ${plugin.compat}`,
        },
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
    if (!category || page.items.length < 3) return null;
    return {
      title: locale === "zh" ? `${category.name} 插件` : `${category.name} plugins`,
      description:
        locale === "zh"
          ? `已验证的 ${category.name} DSH 插件。`
          : `Verified DSH plugins in ${category.name}.`,
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
    if (
      publisher["localization_status"] !== "ready" ||
      result.plugins.length === 0 ||
      login !== publisherMatch[1]
    )
      return null;
    const name = String(publisher["localized_name"] ?? login);
    const description = String(
      publisher["seo_description"] ?? publisher["localized_bio"] ?? "DSHX plugin publisher",
    );
    return {
      title: `${name} · DSHX Hub`,
      description,
      canonical: canonical(pathname),
      locale,
      sections: [
        {
          title: locale === "zh" ? "发布的插件" : "Published plugins",
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
        {
          "@type": "ProfilePage",
          name,
          mainEntity: {
            "@type": publisher["kind"] === "organization" ? "Organization" : "Person",
            name,
          },
        },
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
        title: `${report.completedAt} · ${report.outcome}`,
        blocks: [
          { kind: "paragraph", text: report.body },
          { kind: "paragraph", text: `Run: ${report.runId}` },
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
