import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Bookmark, LoaderCircle, Star } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { AddToCollectionDialog, ClaimPluginDialog, ReportDialog } from "./community-dialogs";
import { SignInButton } from "./auth-controls";
import { Turnstile } from "./turnstile";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth/client";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { ApiError, apiKeys, apiRequest, apiSchemas } from "@/lib/api-client";

type Relationships = {
  bookmarks: Array<{ id: string }>;
  pluginFollows: Array<{ id: string }>;
};

const relationshipsSchema = z.object({
  bookmarks: z.array(z.object({ id: z.string() }).passthrough()),
  pluginFollows: z.array(z.object({ id: z.string() }).passthrough()),
  publisherFollows: z.array(z.looseObject({})).optional(),
});

export function PluginCommunityActions({
  pluginId,
  slug,
  locale,
}: {
  pluginId: string;
  slug: string;
  locale: "en" | "zh";
}) {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const relationshipQuery = useQuery<Relationships>({
    queryKey: apiKeys.relationships,
    queryFn: ({ signal }) => apiRequest("/api/me/relationships", relationshipsSchema, { signal }),
    enabled: Boolean(session.data),
  });
  const relationshipMutation = useMutation({
    mutationFn: (input: { kind: "bookmark" | "follow"; enabled: boolean }) =>
      apiRequest(`/api/me/plugins/${pluginId}/${input.kind}`, apiSchemas.object, {
        method: input.enabled ? "PUT" : "DELETE",
        json: {
          turnstileToken: token,
          idempotencyKey: `${input.kind}:${crypto.randomUUID()}`,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: apiKeys.relationships });
    },
  });
  const reviewMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/plugins/${encodeURIComponent(slug)}/review`, apiSchemas.object, {
        method: "PUT",
        json: {
          rating,
          body: body.trim() || null,
          locale,
          turnstileToken: token,
          idempotencyKey: `review:${crypto.randomUUID()}`,
        },
      }),
  });
  const relationships = relationshipQuery.data ?? null;
  const pending = relationshipMutation.isPending
    ? relationshipMutation.variables.kind
    : reviewMutation.isPending
      ? "review"
      : null;

  if (!hydrated || session.isPending) return null;
  if (!session.data)
    return (
      <div className="border-t border-border pt-5">
        <p className="mb-3 text-xs leading-5 text-muted-foreground">
          Sign in to bookmark, follow, review, reply, report, or claim this plugin.
        </p>
        <SignInButton callbackURL={`/${locale}/plugins/${slug}`} />
      </div>
    );

  const bookmarked = relationships?.bookmarks.some((plugin) => plugin.id === pluginId) ?? false;
  const followed = relationships?.pluginFollows.some((plugin) => plugin.id === pluginId) ?? false;

  function resetChallenge() {
    setToken("");
    setChallenge((value) => value + 1);
  }

  function handleVerificationFailure(error: unknown) {
    if (error instanceof ApiError && error.code === "turnstile_failed") resetChallenge();
  }

  async function relationship(kind: "bookmark" | "follow", enabled: boolean) {
    if (pending) return;
    setMessage(null);
    try {
      await relationshipMutation.mutateAsync({ kind, enabled });
    } catch (error) {
      handleVerificationFailure(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "The relationship could not be updated. Check your connection and try again.",
      );
    }
  }

  async function review() {
    if (pending) return;
    setMessage(null);
    try {
      await reviewMutation.mutateAsync();
      setMessage("Review published.");
      window.dispatchEvent(new CustomEvent("dshx:reviews-changed", { detail: { slug } }));
    } catch (error) {
      handleVerificationFailure(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "The review could not be published. Check your connection and try again.",
      );
    }
  }

  return (
    <section className="space-y-4 border-t border-border pt-5">
      <Turnstile key={challenge} onToken={setToken} />
      <div className="flex gap-2">
        <Button
          variant={bookmarked ? "secondary" : "outline"}
          size="sm"
          disabled={!token || pending !== null}
          aria-busy={pending === "bookmark"}
          onClick={() => void relationship("bookmark", !bookmarked)}
        >
          {pending === "bookmark" ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden />
          ) : (
            <Bookmark data-icon="inline-start" className={cn(bookmarked && "fill-current")} />
          )}{" "}
          {pending === "bookmark" ? "Saving…" : bookmarked ? "Bookmarked" : "Bookmark"}
        </Button>
        <Button
          variant={followed ? "secondary" : "outline"}
          size="sm"
          disabled={!token || pending !== null}
          aria-busy={pending === "follow"}
          onClick={() => void relationship("follow", !followed)}
        >
          {pending === "follow" ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden />
          ) : (
            <Bell data-icon="inline-start" className={cn(followed && "fill-current")} />
          )}{" "}
          {pending === "follow" ? "Saving…" : followed ? "Following" : "Follow"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 border-t border-border pt-3">
        <AddToCollectionDialog pluginId={pluginId} />
        <ClaimPluginDialog slug={slug} />
        <ReportDialog targetType="plugin" targetId={pluginId} label="Report plugin" />
      </div>
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Your review</h2>
          <div className="flex" aria-label={`${rating} stars`}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                onClick={() => setRating(value)}
                aria-label={`${value} stars`}
                className="p-0.5 text-accent"
              >
                <Star className={cn("size-4", value <= rating && "fill-current")} />
              </button>
            ))}
          </div>
        </div>
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={4000}
          className="mt-3 min-h-20"
          placeholder="Share specific, useful experience (optional)."
        />
        <Button
          size="sm"
          className="mt-3"
          disabled={!token || pending !== null}
          aria-busy={pending === "review"}
          onClick={() => void review()}
        >
          {pending === "review" ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden />
          ) : null}
          {pending === "review" ? "Publishing…" : "Publish review"}
        </Button>
      </div>
      {message ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
