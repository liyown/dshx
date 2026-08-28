import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { LazyMotion } from "motion/react";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";
import { Nav } from "../components/dshx/nav";
import { Footer } from "../components/dshx/footer";
import { DevelopmentBanner } from "../components/dshx/development-banner";
import { SiteMotionLayer } from "../components/dshx/site-motion-layer";
import { createTranslator, localeFromPathname, localizedPath } from "../lib/i18n";
import { I18nProvider } from "../lib/i18n/provider";
import { themeInitializationScript } from "../lib/theme";

const loadMotionFeatures = () => import("../lib/motion-features").then((module) => module.default);

function NotFoundComponent() {
  const location = useRouterState({ select: (state) => state.location });
  const locale = localeFromPathname(location.pathname);
  const t = createTranslator(locale);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("errors.pageNotFound")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("errors.pageNotFoundBody")}</p>
        <div className="mt-6">
          <Link
            to="/$locale"
            params={{ locale }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("errors.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const locale = localeFromPathname(location.pathname);
  const t = createTranslator(locale);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("errors.pageLoadFailed")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("errors.pageLoadFailedBody")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("errors.tryAgain")}
          </button>
          <a
            href={localizedPath(locale, "/")}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("errors.goHome")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "color-scheme", content: "light dark" },
      ...(import.meta.env["GOOGLE_SITE_VERIFICATION"]
        ? [
            {
              name: "google-site-verification",
              content: import.meta.env["GOOGLE_SITE_VERIFICATION"],
            },
          ]
        : []),
      ...(import.meta.env["BING_SITE_VERIFICATION"]
        ? [{ name: "msvalidate.01", content: import.meta.env["BING_SITE_VERIFICATION"] }]
        : []),
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const location = useRouterState({ select: (state) => state.location });
  const locale = localeFromPathname(location.pathname);
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const location = useRouterState({ select: (state) => state.location });
  const locale = localeFromPathname(location.pathname);
  const isAdmin = location.pathname === "/admin" || location.pathname.startsWith("/admin/");

  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <QueryClientProvider client={queryClient}>
        <I18nProvider locale={locale}>
          {isAdmin ? (
            <Outlet />
          ) : (
            <div className="site-motion-shell">
              <div className="site-motion-content">
                {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
                <DevelopmentBanner />
                <Nav />
                <Outlet />
                <Footer />
              </div>
              <SiteMotionLayer />
            </div>
          )}
        </I18nProvider>
      </QueryClientProvider>
    </LazyMotion>
  );
}
