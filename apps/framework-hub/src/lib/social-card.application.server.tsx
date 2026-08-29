import type { Database } from "@/lib/db/client";
import { buildPluginInstallCommand, selectInstallTarget } from "./catalog/install-target";
import { getCatalogPlugin } from "./catalog/repository.server";
import type { Locale } from "./i18n";
import { renderPluginSocialCard } from "./social-card.server";

export type PluginSocialCardResult =
  | { readonly status: "not-found" }
  | { readonly status: "redirect"; readonly slug: string }
  | { readonly status: "ready"; readonly response: Response };

export async function buildCatalogPluginSocialCard(
  db: Database,
  slug: string,
  locale: Locale,
): Promise<PluginSocialCardResult> {
  const detail = await getCatalogPlugin(db, slug, locale);
  if (!detail) return { status: "not-found" };
  if (detail.redirectSlug) return { status: "redirect", slug: detail.redirectSlug };
  const plugin = detail.plugin;
  const target = selectInstallTarget(
    detail.installTargets,
    plugin.scope,
    plugin.version,
    detail.repositoryUrl,
  );
  return {
    status: "ready",
    response: await renderPluginSocialCard({
      locale,
      slug: plugin.slug,
      name: plugin.name,
      packageName: plugin.scope,
      description: plugin.description,
      author: plugin.author,
      version: plugin.version,
      category: plugin.category,
      installCommand: target ? buildPluginInstallCommand(target.spec) : null,
      badge: plugin.badge,
    }),
  };
}
