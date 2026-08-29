import { createFileRoute } from "@tanstack/react-router";

import { requireDatabase } from "@/lib/db/client";
import { locales, type Locale } from "@/lib/i18n";
import { buildCatalogPluginSocialCard } from "@/lib/social-card.application.server";

function resolveLocale(value: string): Locale | null {
  return locales.find((locale) => locale === value) ?? null;
}

export const Route = createFileRoute("/og/plugins/$locale/$slug/card.png")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        const locale = resolveLocale(params.locale);
        if (!locale) return new Response("Not found", { status: 404 });
        const result = await buildCatalogPluginSocialCard(
          requireDatabase(context),
          params.slug,
          locale,
        );
        if (result.status === "not-found") return new Response("Not found", { status: 404 });
        if (result.status === "redirect") {
          const destination = new URL(request.url);
          destination.pathname = `/og/plugins/${locale}/${encodeURIComponent(result.slug)}/card.png`;
          return Response.redirect(destination, 308);
        }
        return result.response;
      },
    },
  },
});
