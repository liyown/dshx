import { Link } from "@tanstack/react-router";
import type { Plugin } from "@/lib/plugins";
import { Chip } from "./primitives";
import { cn } from "@/lib/utils";
import { localizedPath, useI18n } from "@/lib/i18n";

function BadgeTag({ badge }: { badge: Plugin["badge"] }) {
  const { t } = useI18n();
  if (badge === "official") return <Chip tone="accent">{t("plugin.badge.official")}</Chip>;
  if (badge === "verified") return <Chip tone="ok">{t("plugin.badge.verified")}</Chip>;
  return <Chip>{t("plugin.badge.community")}</Chip>;
}

function Glyph({ plugin, size = 40 }: { plugin: Plugin; size?: number }) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-[9px] border border-border bg-surface-2 font-mono font-medium text-foreground"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {plugin.glyph}
      <span className="absolute right-[3px] bottom-[3px] size-[3px] rounded-full bg-accent/70" />
    </div>
  );
}

export function PluginCard({ plugin }: { plugin: Plugin }) {
  const { locale } = useI18n();
  return (
    <Link
      data-scroll-surface
      to={localizedPath(locale, "/plugins/" + plugin.slug)}
      className="group relative flex flex-col gap-3.5 rounded-xl border border-border bg-surface p-4 transition-colors duration-150 hover:border-border-strong hover:bg-surface-2/60"
    >
      <div className="flex items-start gap-3">
        <Glyph plugin={plugin} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14.5px] font-medium">{plugin.name}</span>
            <BadgeTag badge={plugin.badge} />
          </div>
          <div className="truncate font-mono text-[11.5px] text-muted-foreground">
            {plugin.scope}
          </div>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          →
        </span>
      </div>

      <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
        {plugin.description}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
        <span>{plugin.author}</span>
        <span className="text-border-strong">/</span>
        <span>v{plugin.version}</span>
        <span className="text-border-strong">/</span>
        <span>{plugin.compat}</span>
        <span className="ml-auto flex items-center gap-3">
          <span>★ {plugin.stars}</span>
          <span>↓ {plugin.downloads}</span>
        </span>
      </div>
    </Link>
  );
}

export function PluginRow({ plugin }: { plugin: Plugin }) {
  const { locale } = useI18n();
  return (
    <Link
      data-scroll-surface
      to={localizedPath(locale, "/plugins/" + plugin.slug)}
      className="group flex items-center gap-4 border-b border-border px-3 py-3.5 transition-colors last:border-b-0 hover:bg-surface-2/60"
    >
      <Glyph plugin={plugin} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-medium">{plugin.name}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{plugin.scope}</span>
          <BadgeTag badge={plugin.badge} />
        </div>
        <p className="truncate text-[12.5px] text-muted-foreground">{plugin.description}</p>
      </div>
      <div className="hidden shrink-0 items-center gap-4 font-mono text-[11px] text-muted-foreground sm:flex">
        <span>{plugin.category}</span>
        <span>v{plugin.version}</span>
        <span>★ {plugin.stars}</span>
        <span className={cn("w-24 text-right")}>{plugin.updated}</span>
      </div>
    </Link>
  );
}
