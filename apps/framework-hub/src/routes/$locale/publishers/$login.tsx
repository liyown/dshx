import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import {
  PublicPageHeader,
  PublicPluginList,
  type PublicPlugin,
} from "@/components/community/public-list";
import { PublisherFollowButton } from "@/components/community/community-dialogs";
import { Container, SectionLabel } from "@/components/dshx/primitives";
import { loadPublicPublisher } from "@/lib/community/functions";
import { parseLocale } from "@/lib/i18n";
import { breadcrumbList, buildSeoHead, localizedAlternatesForLocales, publicUrl } from "@/lib/seo";
import { loadIndexableSitemapLocales } from "@/lib/sitemap.functions";

export const Route = createFileRoute("/$locale/publishers/$login")({
  loader: async ({ params }) => {
    let data;
    try {
      const publisher = await loadPublicPublisher({
        data: { login: params.login, locale: parseLocale(params.locale) },
      });
      const indexableLocales = await loadIndexableSitemapLocales({
        data: { kind: "publisher", value: publisher.publisher.login },
      });
      data = { ...publisher, indexableLocales };
    } catch {
      throw notFound();
    }
    if (data.publisher.login !== params.login)
      throw redirect({
        to: "/$locale/publishers/$login",
        params: { locale: params.locale, login: data.publisher.login },
        statusCode: 308,
      });
    return data;
  },
  head: ({ loaderData, params }) => {
    const locale = parseLocale(params.locale);
    const publisher = loaderData?.publisher;
    const title = publisher?.seo_title ?? publisher?.localized_name ?? "Publisher";
    const description =
      publisher?.seo_description ?? publisher?.localized_bio ?? "DSHX plugin publisher";
    const login = publisher?.login ?? params.login;
    const path = `/${locale}/publishers/${login}`;
    const indexableLocales = loaderData?.indexableLocales ?? [];
    const entityType = publisher?.kind === "organization" ? "Organization" : "Person";
    return buildSeoHead({
      locale,
      path,
      title: `${title} · DSHX Hub`,
      description,
      robots: indexableLocales.includes(locale) ? "index,follow" : "noindex,follow",
      alternates: localizedAlternatesForLocales(`/publishers/${login}`, indexableLocales),
      structuredData: [
        {
          "@id": `${publicUrl(path)}#profile`,
          "@type": "ProfilePage",
          name: title,
          description,
          url: publicUrl(path),
          inLanguage: locale === "zh" ? "zh-CN" : "en",
          mainEntity: { "@id": `${publicUrl(path)}#publisher` },
        },
        {
          "@id": `${publicUrl(path)}#publisher`,
          "@type": entityType,
          name: publisher?.localized_name ?? login,
          description: publisher?.localized_bio ?? description,
          url: publicUrl(path),
          ...(publisher?.avatar_url ? { image: publisher.avatar_url } : {}),
        },
        breadcrumbList([
          { name: "DSHX", path: `/${locale}` },
          { name: publisher?.localized_name ?? login, path },
        ]),
      ],
    });
  },
  component: PublisherPage,
});

function PublisherPage() {
  const { publisher, plugins } = Route.useLoaderData();
  const locale = parseLocale(Route.useParams().locale);
  return (
    <main>
      <Container className="py-16 md:py-24">
        <PublicPageHeader
          eyebrow={`${publisher.kind} · @${publisher.login}`}
          title={publisher.localized_name}
          description={publisher.localized_bio}
          avatarUrl={publisher.avatar_url}
        />
        <PublisherFollowButton publisherId={publisher.id} />
        <section className="mt-12">
          <SectionLabel index="01">
            {locale === "zh" ? "发布的插件" : "Published plugins"}
          </SectionLabel>
          <div className="mt-5">
            <PublicPluginList
              plugins={plugins as PublicPlugin[]}
              empty={locale === "zh" ? "暂无公开插件。" : "No public plugins yet."}
            />
          </div>
        </section>
      </Container>
    </main>
  );
}
