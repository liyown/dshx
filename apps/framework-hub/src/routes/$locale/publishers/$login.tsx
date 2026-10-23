import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import {
  PublicPageHeader,
  PublicPluginList,
  type PublicPlugin,
} from "@/components/community/public-list";
import { PublisherFollowButton } from "@/components/community/community-dialogs";
import { Container, SectionLabel } from "@/components/dshx/primitives";
import { loadPublicPublisher } from "@/lib/community/functions";
import { createTranslator, parseLocale } from "@/lib/i18n";
import {
  breadcrumbs,
  buildPageHead,
  localePath,
  pageIndexation,
  pageTitle,
  profilePage,
} from "@/lib/seo";
import { loadIndexableLocales } from "@/lib/public-pages.functions";

export const Route = createFileRoute("/$locale/publishers/$login")({
  loader: async ({ params }) => {
    let data;
    try {
      const publisher = await loadPublicPublisher({
        data: { login: params.login, locale: parseLocale(params.locale) },
      });
      const indexableLocales = await loadIndexableLocales({
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
    const t = createTranslator(locale);
    const title = publisher?.seo_title ?? publisher?.localized_name ?? "Publisher";
    const description =
      publisher?.seo_description ?? publisher?.localized_bio ?? t("document.publisherDescription");
    const login = publisher?.login ?? params.login;
    const to = `/publishers/${login}`;
    const indexableLocales = loaderData?.indexableLocales ?? [];
    return buildPageHead({
      locale,
      path: localePath(locale, to),
      title: pageTitle(title, "DSHX Hub"),
      description,
      ...pageIndexation(to, indexableLocales, locale),
      structuredData: [
        ...profilePage({
          locale,
          to,
          name: title,
          description,
          entity: {
            type: publisher?.kind === "organization" ? "Organization" : "Person",
            name: publisher?.localized_name ?? login,
            description: publisher?.localized_bio ?? description,
            ...(publisher?.avatar_url ? { image: publisher.avatar_url } : {}),
          },
        }),
        breadcrumbs(locale, [{ name: publisher?.localized_name ?? login, to }]),
      ],
    });
  },
  component: PublisherPage,
});

function PublisherPage() {
  const { publisher, plugins } = Route.useLoaderData();
  const locale = parseLocale(Route.useParams().locale);
  const t = createTranslator(locale);
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
          <SectionLabel index="01">{t("profile.publishedPlugins")}</SectionLabel>
          <div className="mt-5">
            <PublicPluginList
              plugins={plugins as PublicPlugin[]}
              empty={t("profile.publishedPluginsEmpty")}
            />
          </div>
        </section>
      </Container>
    </main>
  );
}
