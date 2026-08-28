import { useQuery } from "@tanstack/react-query";
import { LogIn } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/use-hydrated";
import { apiKeys, apiRequest } from "@/lib/api-client";

type PublicSession = { user: { name: string } };
const publicSessionSchema = z.object({ user: z.object({ name: z.string() }) }).nullable();
const publicConfigSchema = z.object({ githubAuthConfigured: z.boolean().optional() });

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
    <a
      href="/en/account"
      className="hidden rounded-md px-2.5 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground lg:block"
    >
      {session.data.user.name}
    </a>
  );
}

export function MobileSessionLink({ locale }: { locale: "en" | "zh" }) {
  const session = usePublicSession();
  const hydrated = useHydrated();
  if (!hydrated || session.isPending) return null;
  if (!session.data) return <SignInButton callbackURL={`/${locale}/account`} />;
  return (
    <a href={`/${locale}/account`} className="py-2.5 text-sm text-muted-foreground">
      {session.data.user.name}
    </a>
  );
}
