import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isLocale } from "@/lib/i18n";

export const Route = createFileRoute("/$locale")({
  beforeLoad: ({ params, location }) => {
    if (!isLocale(params.locale)) {
      const suffix = location.pathname.replace(/^\/[^/]+/, "") || "/";
      throw redirect({
        href: "/en" + suffix + location.searchStr + location.hash,
        replace: true,
      });
    }
  },
  component: LocaleLayout,
});

function LocaleLayout() {
  return <Outlet />;
}
