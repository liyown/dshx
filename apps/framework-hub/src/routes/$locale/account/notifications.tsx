import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage } from "@/components/community/account-pages";

export const Route = createFileRoute("/$locale/account/notifications")({
  head: () => ({
    meta: [{ title: "Notifications · DSHX Hub" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: NotificationsPage,
});
