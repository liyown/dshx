import { Link } from "@tanstack/react-router";
import type { CatalogCard as Plugin } from "@/lib/catalog/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "./primitives";
import { cn } from "@/lib/utils";
import { localizedPath } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";

function formatMetric(value: number | null): string {
  return value === null ? "—" : String(value);
}

function BadgeTag({ badge }: { badge: Plugin["badge"] }) {
  const { t } = useI18n();
  if (badge === "official") return <Chip tone="accent">{t("plugin.badge.official")}</Chip>;
  return <Chip>{t("plugin.badge.community")}</Chip>;
}

export function PluginGlyph({
  plugin,
  size = 40,
  priority = false,
}: {
  plugin: Plugin;
  size?: number;
  priority?: boolean;
}) {
  return (
    <Avatar
      className="relative shrink-0 rounded-[9px] border border-border bg-surface-2 font-mono font-medium text-foreground"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {plugin.iconUrl ? (
        <AvatarImage
          src={plugin.iconUrl}
          alt=""
          className="object-cover"
          loading={priority ? "eager" : "lazy"}
          decoding="async"
        />
      ) : null}
      <AvatarFallback className="rounded-[8px] bg-surface-2">{plugin.glyph}</AvatarFallback>
      <span className="absolute right-[3px] bottom-[3px] size-[3px] rounded-full bg-accent/70" />
    </Avatar>
  );
}

export function PublisherIdentity({
  plugin,
  compact = false,
  priority = false,
  className,
}: {
  plugin: Plugin;
  compact?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  const login = plugin.publisher.login || plugin.author;
  return (
    <Link
      to={localizedPath(locale, `/publishers/${login}`)}
      aria-label={`@${login}`}
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Avatar className={cn("border border-border bg-surface-2", compact ? "size-4" : "size-5")}>
        {plugin.publisher.avatarUrl ? (
          <AvatarImage
            src={plugin.publisher.avatarUrl}
            alt=""
            className="object-cover"
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <AvatarFallback className={cn("font-mono", compact ? "text-[8px]" : "text-[10px]")}>
          {login.slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">@{login}</span>
    </Link>
  );
}

export function PluginCard({ plugin }: { plugin: Plugin }) {
  const { locale } = useI18n();
  return (
    <article
      data-scroll-surface
      className="group relative flex flex-col gap-3.5 rounded-xl border border-border bg-surface p-4 transition-colors duration-150 hover:border-border-strong hover:bg-surface-2/60 focus-within:border-border-strong"
    >
      <Link
        to={localizedPath(locale, "/plugins/" + plugin.slug)}
        aria-label={plugin.name}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
      <div className="pointer-events-none relative z-10 flex items-start gap-3">
        <PluginGlyph plugin={plugin} />
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

      <p className="pointer-events-none relative z-10 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
        {plugin.description}
      </p>

      <div className="pointer-events-none relative z-10 mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
        <PublisherIdentity plugin={plugin} className="pointer-events-auto" />
        <span className="text-border-strong">/</span>
        <span>v{plugin.version}</span>
        <span className="text-border-strong">/</span>
        <span>{plugin.compat}</span>
        <span className="ml-auto flex items-center gap-3">
          <span>★ {formatMetric(plugin.stars)}</span>
          <span>↓ {plugin.downloads}</span>
        </span>
      </div>
    </article>
  );
}

export function PluginRow({ plugin }: { plugin: Plugin }) {
  const { locale } = useI18n();
  return (
    <article
      data-scroll-surface
      className="group relative flex items-center gap-4 border-b border-border px-3 py-3.5 transition-colors last:border-b-0 hover:bg-surface-2/60 focus-within:bg-surface-2/60"
    >
      <Link
        to={localizedPath(locale, "/plugins/" + plugin.slug)}
        aria-label={plugin.name}
        className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
      <div className="pointer-events-none relative z-10">
        <PluginGlyph plugin={plugin} size={28} />
      </div>
      <div className="pointer-events-none relative z-10 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-medium">{plugin.name}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{plugin.scope}</span>
          <BadgeTag badge={plugin.badge} />
        </div>
        <p className="truncate text-[12.5px] text-muted-foreground">{plugin.description}</p>
        <PublisherIdentity
          plugin={plugin}
          compact
          className="pointer-events-auto mt-1 font-mono text-[10.5px]"
        />
      </div>
      <div className="pointer-events-none relative z-10 hidden shrink-0 items-center gap-4 font-mono text-[11px] text-muted-foreground sm:flex">
        <span>{plugin.category}</span>
        <span>v{plugin.version}</span>
        <span>★ {formatMetric(plugin.stars)}</span>
        <span className={cn("w-24 text-right")}>{plugin.updated}</span>
      </div>
    </article>
  );
}
