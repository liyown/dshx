import { Link, useRouterState } from "@tanstack/react-router";

import { Container } from "@/components/dshx/primitives";
import { localizedPath, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const sections = [
  ["Overview", ""],
  ["Notifications", "/notifications"],
  ["Collections", "/collections"],
  ["Submissions", "/submissions"],
  ["Appeals", "/appeals"],
  ["Settings", "/settings"],
] as const;

export function AccountShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  const { locale } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <main>
      <Container className="py-12 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[210px_minmax(0,1fr)]">
          <aside>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">
              Community account
            </p>
            <nav className="mt-6 flex gap-2 overflow-auto lg:flex-col">
              {sections.map(([label, suffix]) => {
                const href = localizedPath(locale, `/account${suffix}`);
                const active = pathname === href;
                return (
                  <Link
                    key={label}
                    to={href}
                    className={cn(
                      "whitespace-nowrap rounded-md px-3 py-2 text-sm",
                      active
                        ? "bg-surface-2 text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </aside>
          <div>
            <header className="border-b border-border pb-8">
              <h1 className="text-4xl font-medium tracking-[-0.035em]">{title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{intro}</p>
            </header>
            <div className="pt-8">{children}</div>
          </div>
        </div>
      </Container>
    </main>
  );
}

export function AccountAccess({ message }: { message: string }) {
  const { locale } = useI18n();
  return (
    <div className="border-y border-border py-12">
      <h2 className="text-lg font-medium">Sign in required</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <button
        onClick={() =>
          void import("@/lib/auth/client").then(({ authClient }) =>
            authClient.signIn.social({
              provider: "github",
              callbackURL: localizedPath(locale, "/account"),
            }),
          )
        }
        className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Sign in with GitHub
      </button>
    </div>
  );
}

export function AccountLoading() {
  return (
    <p className="border-y border-border py-12 text-sm text-muted-foreground">
      Loading account data…
    </p>
  );
}
