import { createFileRoute, notFound } from "@tanstack/react-router";

import { PluginCard } from "@/components/dshx/plugin-card";
import { Container, SectionLabel } from "@/components/dshx/primitives";
import { loadCatalog } from "@/lib/catalog/functions";
import { parseLocale } from "@/lib/i18n";

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
    const copy = categoryCopy[parseLocale(params.locale)];
    const name = loaderData?.category.name ?? params.slug;
    const canonical = `https://dshx.io/${params.locale}/categories/${params.slug}`;
    return {
      meta: [
        { title: copy.title(name) },
        {
          name: "description",
          content: copy.meta(name),
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
