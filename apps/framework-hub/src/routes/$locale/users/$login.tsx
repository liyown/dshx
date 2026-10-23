import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import {
  PublicPageHeader,
  PublicPluginList,
  type PublicPlugin,
} from "@/components/community/public-list";
import { UserSafetyActions } from "@/components/community/community-dialogs";
import { Container, SectionLabel } from "@/components/dshx/primitives";
import { loadPublicUser } from "@/lib/community/functions";
import { createTranslator, parseLocale } from "@/lib/i18n";

export const Route = createFileRoute("/$locale/users/$login")({
  loader: async ({ params }) => {
    try {
      return await loadPublicUser({ data: { login: params.login } });
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${String(loaderData?.displayName ?? "User")} · DSHX Hub` },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: PublicUserPage,
});

function PublicUserPage() {
  const user = Route.useLoaderData();
  const locale = parseLocale(Route.useParams().locale);
  const t = createTranslator(locale);
  const contributions = user.contributions;
  return (
    <main>
      <Container className="py-16 md:py-24">
        <PublicPageHeader
          eyebrow={`GitHub · @${user.login}`}
          title={user.displayName}
          description={user.bio}
          avatarUrl={user.avatarUrl}
        />
        <UserSafetyActions userId={user.id} />
        <div className="grid gap-8 border-b border-border py-8 sm:grid-cols-3">
          {[
            [t("profile.maintained"), contributions["maintained_plugins"] ?? 0],
            [t("profile.reviews"), contributions["reviews"] ?? 0],
            [t("profile.replies"), contributions["replies"] ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <div className="font-mono text-3xl">{value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        <section className="mt-12">
          <SectionLabel index="01">{t("profile.claimedPlugins")}</SectionLabel>
          <div className="mt-5">
            <PublicPluginList
              plugins={user.plugins as PublicPlugin[]}
              empty={t("profile.claimedPluginsEmpty")}
            />
          </div>
        </section>
        <section className="mt-14">
          <SectionLabel index="02">{t("profile.publicBookmarks")}</SectionLabel>
          <div className="mt-5">
            <PublicPluginList
              plugins={user.bookmarks as PublicPlugin[]}
              empty={t("profile.publicBookmarksEmpty")}
            />
          </div>
        </section>
        <section className="mt-14">
          <SectionLabel index="03">{t("profile.publicCollections")}</SectionLabel>
          <div className="mt-5 divide-y divide-border border-y border-border">
            {user.collections.map((collection) => (
              <Link
                key={collection.id}
                to="/$locale/collections/$id"
                params={{ locale, id: collection.id }}
                className="flex items-center justify-between py-4"
              >
                <span className="font-medium">{collection.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {t("profile.collectionPluginCount", { count: collection.plugin_count })}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </Container>
    </main>
  );
}
