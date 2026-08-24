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

export const Route = createFileRoute("/$locale/publishers/$login")({
  loader: async ({ params }) => {
    let data;
    try {
      data = await loadPublicPublisher({
        data: { login: params.login, locale: parseLocale(params.locale) },
      });
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
    const publisher = loaderData?.publisher;
    const title = publisher?.seo_title ?? publisher?.localized_name ?? "Publisher";
    const description =
      publisher?.seo_description ?? publisher?.localized_bio ?? "DSHX plugin publisher";
    const indexable = publisher?.localization_status === "ready";
    const canonical = `https://dshx.io/${params.locale}/publishers/${publisher?.login ?? params.login}`;
    return {
      meta: [
        { title: `${title} · DSHX Hub` },
        { name: "description", content: description },
        { name: "robots", content: indexable ? "index,follow" : "noindex,follow" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
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
