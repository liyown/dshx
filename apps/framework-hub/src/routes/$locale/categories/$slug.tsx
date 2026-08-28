import { createFileRoute, notFound } from "@tanstack/react-router";

import { PluginCard } from "@/components/dshx/plugin-card";
import { Container, SectionLabel } from "@/components/dshx/primitives";
import { loadCatalog } from "@/lib/catalog/functions";
import { parseLocale } from "@/lib/i18n";
import { breadcrumbList, buildSeoHead, localizedAlternatesForLocales, publicUrl } from "@/lib/seo";
import { loadIndexableSitemapLocales } from "@/lib/sitemap.functions";

const categoryCopy = {
  en: {
    label: "Verified registry",
    description:
      "Verified DSH bundles in a Hub-managed category. The Hub uses GitHub topics only as source evidence for its public categories.",
    title: (name: string) => `${name} plugins | DSHX Hub`,
    meta: (name: string) =>
      `Verified DSH plugins in ${name}, with compatibility, version and maintainer information.`,
  },
  zh: {
    label: "已验证目录",
    description: "Hub 管理的分类中已通过验证的 DSH Bundle。GitHub Topic 仅作为公开分类的来源依据。",
    title: (name: string) => `${name} 插件 | DSHX Hub`,
    meta: (name: string) => `查看 ${name} 分类中已验证的 DSH 插件、兼容性、版本与维护者信息。`,
  },
} as const;

export const Route = createFileRoute("/$locale/categories/$slug")({
  loader: async ({ params }) => {
    const [page, indexableLocales] = await Promise.all([
      loadCatalog({
        data: {
          locale: parseLocale(params.locale),
          category: params.slug,
          q: "",
          sort: "featured",
          limit: 50,
        },
      }),
      loadIndexableSitemapLocales({
        data: { kind: "category", value: params.slug },
      }),
    ]);
    const category = page.categories.find((item) => item.slug === params.slug);
    if (!category) throw notFound();
    return { ...page, category, indexableLocales };
  },
  head: ({ loaderData, params }) => {
    const locale = parseLocale(params.locale);
    const copy = categoryCopy[locale];
    const name = loaderData?.category.name ?? params.slug;
    const path = `/${locale}/categories/${params.slug}`;
    const items = loaderData?.items ?? [];
    const indexableLocales = loaderData?.indexableLocales ?? [];
    return buildSeoHead({
      locale,
      path,
      title: copy.title(name),
      description: copy.meta(name),
      robots: indexableLocales.includes(locale) ? "index,follow" : "noindex,follow",
      alternates: localizedAlternatesForLocales(`/categories/${params.slug}`, indexableLocales),
      structuredData: [
        {
          "@id": `${publicUrl(path)}#collection`,
          "@type": "CollectionPage",
          name,
          description: copy.meta(name),
          url: publicUrl(path),
          inLanguage: locale === "zh" ? "zh-CN" : "en",
          mainEntity: { "@id": `${publicUrl(path)}#items` },
        },
        {
          "@id": `${publicUrl(path)}#items`,
          "@type": "ItemList",
          numberOfItems: items.length,
          itemListElement: items.map((plugin, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: plugin.name,
            url: publicUrl(`/${locale}/plugins/${plugin.slug}`),
          })),
        },
        breadcrumbList([
          { name: "DSHX", path: `/${locale}` },
          { name: locale === "zh" ? "插件市场" : "Plugins", path: `/${locale}/plugins` },
          { name, path },
        ]),
      ],
    });
  },
  component: CategoryPage,
});

function CategoryPage() {
  const data = Route.useLoaderData();
  const { locale } = Route.useParams();
  const copy = categoryCopy[parseLocale(locale)];
  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="category">{copy.label}</SectionLabel>
        <h1 className="mt-6 text-[clamp(2.25rem,6vw,4rem)] font-medium leading-none tracking-[-0.045em]">
          {data.category.name}
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.description}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((plugin) => (
            <PluginCard key={plugin.slug} plugin={plugin} />
          ))}
        </div>
      </Container>
    </main>
  );
}
