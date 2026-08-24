import { createFileRoute } from "@tanstack/react-router";
import { CollectionsPage } from "@/components/community/account-pages";

export const Route = createFileRoute("/$locale/account/collections")({
  head: () => ({
    meta: [{ title: "Collections · DSHX Hub" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: CollectionsPage,
});
