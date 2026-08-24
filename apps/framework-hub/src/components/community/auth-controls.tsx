import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { useHydrated } from "@/lib/use-hydrated";

export function SignInButton({ callbackURL = "/en/account" }: { callbackURL?: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    void fetch("/api/config")
      .then((response) => response.json() as Promise<{ githubAuthConfigured?: boolean }>)
      .then((config) => setAvailable(config.githubAuthConfigured === true))
      .catch(() => setAvailable(false));
  }, []);
  return (
    <Button
      onClick={() => void authClient.signIn.social({ provider: "github", callbackURL })}
      size="sm"
      disabled={available !== true}
      title={available === false ? "Configure GitHub OAuth to enable sign-in" : undefined}
    >
      <LogIn data-icon="inline-start" />
      {available === false ? "GitHub sign-in unavailable" : "Sign in with GitHub"}
    </Button>
  );
}

export function SessionLink() {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  if (!hydrated || session.isPending) return null;
  if (!session.data)
    return (
      <div className="hidden lg:block">
        <SignInButton />
      </div>
    );
  return (
    <a
      href="/en/account"
      className="hidden rounded-md px-2.5 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground lg:block"
    >
      {session.data.user.name}
    </a>
  );
}

export function MobileSessionLink({ locale }: { locale: "en" | "zh" }) {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  if (!hydrated || session.isPending) return null;
  if (!session.data) return <SignInButton callbackURL={`/${locale}/account`} />;
  return (
    <a href={`/${locale}/account`} className="py-2.5 text-sm text-muted-foreground">
      {session.data.user.name}
    </a>
  );
}
