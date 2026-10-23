import { createFileRoute, notFound } from "@tanstack/react-router";

import { PluginCard } from "@/components/dshx/plugin-card";
import { Container, SectionLabel } from "@/components/dshx/primitives";
import { loadCatalog } from "@/lib/catalog/functions";
import { createTranslator, languageTag, parseLocale } from "@/lib/i18n";
import { breadcrumbList, buildSeoHead, localizedAlternatesForLocales, publicUrl } from "@/lib/seo";
import { loadIndexableSitemapLocales } from "@/lib/sitemap.functions";

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
    const t = createTranslator(locale);
    const name = loaderData?.category.name ?? params.slug;
    const path = `/${locale}/categories/${params.slug}`;
    const items = loaderData?.items ?? [];
    const indexableLocales = loaderData?.indexableLocales ?? [];
    return buildSeoHead({
      locale,
      path,
      title: t("catalog.categoryTitle", { name }),
      description: t("catalog.categoryMeta", { name }),
      robots: indexableLocales.includes(locale) ? "index,follow" : "noindex,follow",
      alternates: localizedAlternatesForLocales(`/categories/${params.slug}`, indexableLocales),
      structuredData: [
        {
          "@id": `${publicUrl(path)}#collection`,
          "@type": "CollectionPage",
          name,
          description: t("catalog.categoryMeta", { name }),
          url: publicUrl(path),
          inLanguage: languageTag(locale),
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
          { name: t("nav.plugins"), path: `/${locale}/plugins` },
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
  const t = createTranslator(parseLocale(locale));
  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="category">{t("catalog.categoryLabel")}</SectionLabel>
        <h1 className="mt-6 text-[clamp(2.25rem,6vw,4rem)] font-medium leading-none tracking-[-0.045em]">
          {data.category.name}
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t("catalog.categoryDescription")}
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((plugin) => (
            <PluginCard key={plugin.slug} plugin={plugin} />
          ))}
        </div>
      </Container>
    </main>
  );
}
