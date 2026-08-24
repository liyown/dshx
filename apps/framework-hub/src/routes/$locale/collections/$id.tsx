import { createFileRoute, notFound } from "@tanstack/react-router";

import {
  PublicPageHeader,
  PublicPluginList,
  type PublicPlugin,
} from "@/components/community/public-list";
import { ReportDialog } from "@/components/community/community-dialogs";
import { Container } from "@/components/dshx/primitives";
import { loadPublicCollection } from "@/lib/community/functions";

export const Route = createFileRoute("/$locale/collections/$id")({
  loader: async ({ params }) => {
    try {
      return await loadPublicCollection({ data: { id: params.id } });
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.collection.name ?? "Collection"} · DSHX Hub` },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: CollectionPage,
});

function CollectionPage() {
  const { collection, plugins } = Route.useLoaderData();
  return (
    <main>
      <Container className="py-16 md:py-24">
        <PublicPageHeader
          eyebrow={`Collection · @${collection.owner_login}`}
          title={collection.name}
          description={collection.description}
        />
        <div className="mt-5">
          <ReportDialog
            targetType="collection"
            targetId={collection.id}
            label="Report collection"
          />
        </div>
        <div className="mt-10">
          <PublicPluginList plugins={plugins as PublicPlugin[]} empty="This collection is empty." />
        </div>
      </Container>
    </main>
  );
}
