import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/community/account-pages";

export const Route = createFileRoute("/$locale/account/settings")({
  head: () => ({
    meta: [{ title: "Settings · DSHX Hub" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: SettingsPage,
});
