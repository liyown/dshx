import { createFileRoute, notFound } from "@tanstack/react-router";

import { PluginCard } from "@/components/dshx/plugin-card";
import { Container, SectionLabel } from "@/components/dshx/primitives";
import { loadCatalog } from "@/lib/catalog/functions";
import { createTranslator, parseLocale } from "@/lib/i18n";
import { breadcrumbs, buildPageHead, collection, localePath, pageIndexation } from "@/lib/seo";
import { loadIndexableLocales } from "@/lib/public-pages.functions";

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
      loadIndexableLocales({
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
    const to = `/categories/${params.slug}`;
    const items = (loaderData?.items ?? []).map((plugin) => ({
      name: plugin.name,
      to: `/plugins/${plugin.slug}`,
    }));
    const indexableLocales = loaderData?.indexableLocales ?? [];
    return buildPageHead({
      locale,
      path: localePath(locale, to),
      title: t("catalog.categoryTitle", { name }),
      description: t("catalog.categoryMeta", { name }),
      ...pageIndexation(to, indexableLocales, locale),
      structuredData: [
        ...collection({
          locale,
          to,
          name,
          description: t("catalog.categoryMeta", { name }),
          items,
        }),
        breadcrumbs(locale, [
          { name: t("nav.plugins"), to: "/plugins" },
          { name, to },
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
