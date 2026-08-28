import { createFileRoute } from "@tanstack/react-router";
import { Container, SectionLabel, Chip } from "@/components/dshx/primitives";
import { CodeSurface, Code } from "@/components/dshx/code";
import { createTranslator, parseLocale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { breadcrumbList, buildSeoHead, localizedAlternates } from "@/lib/seo";
import { examples } from "@/lib/public-content";

export const Route = createFileRoute("/$locale/examples")({
  head: ({ params }) => {
    const locale = parseLocale(params.locale);
    const t = createTranslator(locale);
    const title = t("examples.title") + " — DSHX";
    const description =
      locale === "zh"
        ? "查看使用 React Slot、Host Tool、类型化 Host–Client API 与 Runtime Hook 构建的 DSHX 插件示例。"
        : "Explore DSHX plugin examples for React Slots, Host tools, typed Host–Client APIs, and runtime hooks.";
    return buildSeoHead({
      locale,
      path: `/${locale}/examples`,
      title,
      description,
      alternates: localizedAlternates("/examples"),
      structuredData: [
        breadcrumbList([
          { name: "DSHX", path: `/${locale}` },
          { name: t("examples.title"), path: `/${locale}/examples` },
        ]),
      ],
    });
  },
  component: Examples,
});

function Examples() {
  const { t } = useI18n();
  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="/examples">{t("examples.label")}</SectionLabel>
        <h1 className="text-balance-tight mt-6 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-medium">
          {t("examples.title")}
        </h1>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {examples.map((e) => (
            <div key={e.name} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[13.5px]">{t(e.titleKey)}</span>
                <Chip tone="accent">{t(e.tagKey)}</Chip>
              </div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                {t(e.descriptionKey)}
              </p>
              <CodeSurface className="mt-4" dots={false} title={`${e.name}/src`}>
                <Code code={e.code} />
              </CodeSurface>
            </div>
          ))}
        </div>
      </Container>
    </main>
  );
}
