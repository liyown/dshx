import { createFileRoute } from "@tanstack/react-router";
import { SubmissionsPage } from "@/components/community/account-pages";

export const Route = createFileRoute("/$locale/account/submissions")({
  head: () => ({
    meta: [{ title: "Submissions · DSHX Hub" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: SubmissionsPage,
});
