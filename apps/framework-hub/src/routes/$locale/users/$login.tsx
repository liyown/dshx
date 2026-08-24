import { createFileRoute, notFound } from "@tanstack/react-router";

import {
  PublicPageHeader,
  PublicPluginList,
  type PublicPlugin,
} from "@/components/community/public-list";
import { UserSafetyActions } from "@/components/community/community-dialogs";
import { Container, SectionLabel } from "@/components/dshx/primitives";
import { loadPublicUser } from "@/lib/community/functions";
import { parseLocale } from "@/lib/i18n";

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
            [locale === "zh" ? "维护插件" : "Maintained", contributions["maintained_plugins"] ?? 0],
            [locale === "zh" ? "评价" : "Reviews", contributions["reviews"] ?? 0],
            [locale === "zh" ? "回复" : "Replies", contributions["replies"] ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <div className="font-mono text-3xl">{value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        <section className="mt-12">
          <SectionLabel index="01">
            {locale === "zh" ? "已认领插件" : "Claimed plugins"}
          </SectionLabel>
          <div className="mt-5">
            <PublicPluginList
              plugins={user.plugins as PublicPlugin[]}
              empty={locale === "zh" ? "尚未认领公开插件。" : "No public claimed plugins yet."}
            />
          </div>
        </section>
        <section className="mt-14">
          <SectionLabel index="02">
            {locale === "zh" ? "公开收藏" : "Public bookmarks"}
          </SectionLabel>
          <div className="mt-5">
            <PublicPluginList
              plugins={user.bookmarks as PublicPlugin[]}
              empty={locale === "zh" ? "尚无公开收藏。" : "No public bookmarks yet."}
            />
          </div>
        </section>
        <section className="mt-14">
          <SectionLabel index="03">
            {locale === "zh" ? "公开收藏夹" : "Public collections"}
          </SectionLabel>
          <div className="mt-5 divide-y divide-border border-y border-border">
            {user.collections.map((collection) => (
              <a
                key={collection.id}
                href={`/${locale}/collections/${collection.id}`}
                className="flex items-center justify-between py-4"
              >
                <span className="font-medium">{collection.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {collection.plugin_count} plugins
                </span>
              </a>
            ))}
          </div>
        </section>
      </Container>
    </main>
  );
}
