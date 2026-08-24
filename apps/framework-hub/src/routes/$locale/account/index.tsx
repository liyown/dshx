import { createFileRoute } from "@tanstack/react-router";
import { AccountOverview } from "@/components/community/account-pages";

export const Route = createFileRoute("/$locale/account/")({
  head: () => ({
    meta: [{ title: "Account · DSHX Hub" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: AccountOverview,
});
