import { createFileRoute, notFound } from "@tanstack/react-router";

import { PluginCard } from "@/components/dshx/plugin-card";
import { Container, SectionLabel } from "@/components/dshx/primitives";
import { loadCatalog } from "@/lib/catalog/functions";
import { parseLocale } from "@/lib/i18n";

export const Route = createFileRoute("/$locale/categories/$slug")({
  loader: async ({ params }) => {
    const page = await loadCatalog({
      data: {
        locale: parseLocale(params.locale),
        category: params.slug,
        q: "",
        sort: "featured",
        limit: 50,
      },
    });
    const category = page.categories.find((item) => item.slug === params.slug);
    if (!category) throw notFound();
    return { ...page, category };
  },
  head: ({ loaderData, params }) => {
    const name = loaderData?.category.name ?? params.slug;
    const canonical = `https://dshx.io/${params.locale}/categories/${params.slug}`;
    return {
      meta: [
        { title: `${name} plugins · DSHX Hub` },
        {
          name: "description",
          content: `Verified DSH plugins in ${name}, with compatibility, versions and maintainer information.`,
        },
        { name: "robots", content: "index,follow" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const data = Route.useLoaderData();
  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="category">Verified registry</SectionLabel>
        <h1 className="mt-6 text-[clamp(2.25rem,6vw,4rem)] font-medium leading-none tracking-[-0.045em]">
          {data.category.name}
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">
          Qualified DSH bundles grouped by a controlled Hub category. GitHub topics remain source
          evidence, not public taxonomy.
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
