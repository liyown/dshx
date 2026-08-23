import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isLocale, parseLocale, createTranslator } from "@/lib/i18n";

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
  head: ({ params }) => {
    const locale = parseLocale(params.locale);
    const t = createTranslator(locale);
    return {
      meta: [
        { title: t("seo.title") },
        { name: "description", content: t("seo.description") },
        { property: "og:title", content: t("seo.title") },
        { property: "og:description", content: t("seo.ogDescription") },
        { property: "og:locale", content: locale === "zh" ? "zh_CN" : "en_US" },
      ],
    };
  },
  component: LocaleLayout,
});

function LocaleLayout() {
  return <Outlet />;
}
