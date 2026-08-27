import { Link } from "@tanstack/react-router";
import { Container, Wordmark, XMark } from "./primitives";
import { localizedPath, useI18n, type MessageKey } from "@/lib/i18n";

const groups: {
  title: MessageKey;
  items: { key: MessageKey; to?: string; href?: string }[];
}[] = [
  {
    title: "footer.product",
    items: [
      { key: "nav.plugins", to: "/plugins" },
      { key: "nav.operations", to: "/operations" },
      { key: "nav.docs", to: "/docs" },
      { key: "footer.compatibility", to: "/docs/compatibility" },
    ],
  },
  {
    title: "footer.community",
    items: [
      { key: "nav.github", href: "https://github.com/liyown/dshx" },
      { key: "footer.discussions", href: "https://github.com/liyown/dshx/discussions" },
    ],
  },
  {
    title: "footer.legal",
    items: [
      { key: "footer.privacy", to: "/legal/privacy" },
      { key: "footer.terms", to: "/legal/terms" },
      { key: "footer.communityPolicy", to: "/legal/community" },
    ],
  },
];

export function Footer() {
  const { locale, t } = useI18n();

  return (
    <footer className="mt-32 border-t border-border">
      <Container className="grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)] md:py-20">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <XMark className="size-[18px]" />
            <Wordmark />
          </div>
          <p className="max-w-[16rem] text-[14px] leading-relaxed text-muted-foreground">
            {t("footer.tagline")}
          </p>
          <p className="mt-auto font-mono text-[11px] text-muted-foreground">
            MIT · DSHX 0.1 · protocol-1
          </p>
        </div>

        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-3">
            <span className="mono-label">{t(group.title)}</span>
            {group.items.map((item) =>
              item.href ? (
                <a
                  key={item.key}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[14px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t(item.key)}
                </a>
              ) : (
                <Link
                  key={item.key}
                  to={localizedPath(locale, item.to ?? "/")}
                  className="text-[14px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t(item.key)}
                </Link>
              ),
            )}
          </div>
        ))}
      </Container>
    </footer>
  );
}
