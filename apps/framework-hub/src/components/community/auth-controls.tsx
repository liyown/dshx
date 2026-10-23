import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { publicSessionSchema, type PublicSession } from "@/lib/auth/session.contracts";
import { publicConfigSchema } from "@/lib/config.contracts";
import { useHydrated } from "@/lib/use-hydrated";
import { apiKeys, apiRequest } from "@/lib/api-client";

function usePublicSession() {
  return useQuery<PublicSession | null>({
    queryKey: apiKeys.endpoint("/api/auth/get-session"),
    queryFn: ({ signal }) =>
      apiRequest("/api/auth/get-session", publicSessionSchema, {
        credentials: "include",
        signal,
      }),
  });
}

export function SignInButton({ callbackURL = "/en/account" }: { callbackURL?: string }) {
  const config = useQuery({
    queryKey: apiKeys.endpoint("/api/config"),
    queryFn: ({ signal }) => apiRequest("/api/config", publicConfigSchema, { signal }),
  });
  const available = config.isError ? false : config.data?.githubAuthConfigured;
  return (
    <Button
      onClick={() =>
        void import("@/lib/auth/client").then(({ authClient }) =>
          authClient.signIn.social({ provider: "github", callbackURL }),
        )
      }
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
  const session = usePublicSession();
  const hydrated = useHydrated();
  if (!hydrated || session.isPending) return null;
  if (!session.data)
    return (
      <div className="hidden lg:block">
        <SignInButton />
      </div>
    );
  return (
    <Link
      to="/$locale/account"
      params={{ locale: "en" }}
      className="hidden rounded-md px-2.5 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground lg:block"
    >
      {session.data.user.name}
    </Link>
  );
}

export function MobileSessionLink({ locale }: { locale: "en" | "zh" }) {
  const session = usePublicSession();
  const hydrated = useHydrated();
  if (!hydrated || session.isPending) return null;
  if (!session.data) return <SignInButton callbackURL={`/${locale}/account`} />;
  return (
    <Link
      to="/$locale/account"
      params={{ locale }}
      className="py-2.5 text-sm text-muted-foreground"
    >
      {session.data.user.name}
    </Link>
  );
}
