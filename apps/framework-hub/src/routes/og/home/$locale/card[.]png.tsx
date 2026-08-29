import { createFileRoute } from "@tanstack/react-router";

import { createTranslator, locales, type Locale } from "@/lib/i18n";
import { DSHX_VERSION } from "@/lib/reference-plugin";
import { renderHomeSocialCard } from "@/lib/social-card.server";

function resolveLocale(value: string): Locale | null {
  return locales.find((locale) => locale === value) ?? null;
}

export const Route = createFileRoute("/og/home/$locale/card.png")({
  server: {
    handlers: {
      GET: ({ params }) => {
        const locale = resolveLocale(params.locale);
        if (!locale) return new Response("Not found", { status: 404 });
        const t = createTranslator(locale);
        return renderHomeSocialCard({
          locale,
          title: t("home.heroTitle"),
          description: t("seo.ogDescription"),
          version: DSHX_VERSION,
        });
      },
    },
  },
});
