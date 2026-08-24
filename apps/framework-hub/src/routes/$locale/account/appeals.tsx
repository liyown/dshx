import { createFileRoute } from "@tanstack/react-router";
import { AppealsPage } from "@/components/community/account-pages";

export const Route = createFileRoute("/$locale/account/appeals")({
  head: () => ({
    meta: [{ title: "Appeals · DSHX Hub" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AppealsPage,
});
