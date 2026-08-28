import { Link } from "@tanstack/react-router";

import { localizedPath } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";

export type PublicPlugin = {
  slug: string;
  name: string;
  description: string;
  package_name: string;
  latest_version?: string;
  badge?: string;
  github_stars?: number;
};

export function PublicPluginList({ plugins, empty }: { plugins: PublicPlugin[]; empty: string }) {
  const { locale } = useI18n();
  if (!plugins.length)
    return <p className="border-y border-border py-10 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="divide-y divide-border border-y border-border">
      {plugins.map((plugin) => (
        <Link
          key={plugin.slug}
          to={localizedPath(locale, `/plugins/${plugin.slug}`)}
          className="group grid gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center"
        >
          <div>
            <div className="font-medium group-hover:text-accent">{plugin.name}</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              {plugin.package_name}
            </div>
            <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {plugin.description}
            </p>
          </div>
          <div className="flex gap-3 font-mono text-xs text-muted-foreground sm:justify-end">
            {plugin.latest_version ? <span>v{plugin.latest_version}</span> : null}
            {plugin.github_stars !== undefined ? <span>★ {plugin.github_stars}</span> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}

export function PublicPageHeader({
  eyebrow,
  title,
  description,
  avatarUrl,
}: {
  eyebrow: string;
  title: string;
  description?: string | null;
  avatarUrl?: string | null;
}) {
  return (
    <header className="grid gap-6 border-b border-border pb-10 sm:grid-cols-[1fr_auto] sm:items-end">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
        <h1 className="mt-4 text-[clamp(2.25rem,6vw,4rem)] font-medium leading-none tracking-[-0.045em]">
          {title}
        </h1>
        {description ? (
          <p className="mt-5 max-w-2xl whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="size-20 rounded-full border border-border object-cover sm:size-24"
        />
      ) : null}
    </header>
  );
}
