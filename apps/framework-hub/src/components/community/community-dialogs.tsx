import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Bell, Flag, FolderPlus, MessageSquareReply, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { Turnstile } from "./turnstile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth/client";
import { useHydrated } from "@/lib/use-hydrated";
import { apiKeys, apiRequest, apiSchemas } from "@/lib/api-client";

type ReportTarget = "plugin" | "review" | "reply" | "profile" | "collection";

function writeKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function ReportDialog({
  targetType,
  targetId,
  label = "Report",
}: {
  targetType: ReportTarget;
  targetId: string;
  label?: string;
}) {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/reports", apiSchemas.object, {
        method: "POST",
        json: {
          targetType,
          targetId,
          reason,
          details: details.trim() || null,
          turnstileToken: token,
          idempotencyKey: writeKey("report"),
        },
      }),
  });

  if (!hydrated || !session.data) return null;

  async function submit() {
    setMessage(null);
    try {
      await mutation.mutateAsync();
      setMessage("Report submitted for policy review.");
      setDetails("");
    } catch (error) {
      setMessage(messageFrom(error, "The report could not be submitted."));
    }
    setToken("");
    setChallenge((value) => value + 1);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Flag data-icon="inline-start" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this {targetType}</DialogTitle>
          <DialogDescription>
            Each report includes a snapshot of the item being reported. The system may handle clear
            violations automatically and leave ambiguous cases for review.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor={`report-reason-${targetId}`}>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id={`report-reason-${targetId}`} className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spam">Spam</SelectItem>
                <SelectItem value="abuse">Abuse or threat</SelectItem>
                <SelectItem value="misinformation">Misleading information</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`report-details-${targetId}`}>Evidence or context</Label>
            <Textarea
              id={`report-details-${targetId}`}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={1_000}
              className="mt-2 min-h-24"
            />
          </div>
          <Turnstile key={challenge} onToken={setToken} />
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button disabled={!token} onClick={() => void submit()}>
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReplyDialog({
  reviewId,
  locale,
  onComplete,
}: {
  reviewId: string;
  locale: "en" | "zh";
  onComplete: () => void;
}) {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/reviews/${reviewId}/replies`, apiSchemas.object, {
        method: "POST",
        json: {
          locale,
          body,
          turnstileToken: token,
          idempotencyKey: writeKey("reply"),
        },
      }),
  });
  if (!hydrated || !session.data) return null;

  async function submit() {
    try {
      await mutation.mutateAsync();
      setBody("");
      setOpen(false);
      onComplete();
    } catch (error) {
      setMessage(messageFrom(error, "The reply could not be published."));
    }
    setToken("");
    setChallenge((value) => value + 1);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <MessageSquareReply data-icon="inline-start" /> Reply
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reply to this review</DialogTitle>
          <DialogDescription>
            Replies keep their original language and appear one level below the review.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          minLength={1}
          maxLength={2_000}
          className="min-h-28"
          placeholder="Write a useful, specific reply."
        />
        <Turnstile key={challenge} onToken={setToken} />
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!body.trim() || !token} onClick={() => void submit()}>
            Publish reply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClaimPluginDialog({ slug }: { slug: string }) {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [result, setResult] = useState<{
    file: { path: string; body: Record<string, string> };
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/plugins/${encodeURIComponent(slug)}/claims`,
        z.object({ file: z.object({ path: z.string(), body: z.record(z.string(), z.string()) }) }),
        {
          method: "POST",
          json: {
            turnstileToken: token,
            idempotencyKey: writeKey("claim"),
          },
        },
      ),
  });
  if (!hydrated || !session.data) return null;

  async function createClaim() {
    try {
      const payload = await mutation.mutateAsync();
      setResult(payload);
      setMessage(null);
    } catch (error) {
      setMessage(messageFrom(error, "The claim challenge could not be created."));
    }
    setToken("");
    setChallenge((value) => value + 1);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <ShieldCheck data-icon="inline-start" /> Claim
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Claim this plugin</DialogTitle>
          <DialogDescription>
            The challenge expires after 24 hours. Commit the generated file to the repository's
            default branch. Successful verification creates the maintainer relationship.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="min-w-0 space-y-3">
            <div className="break-all font-mono text-xs text-muted-foreground">
              {result.file.path}
            </div>
            <pre className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-lg bg-ink p-4 font-mono text-xs text-ink-foreground">
              {JSON.stringify(result.file.body, null, 2)}
            </pre>
          </div>
        ) : (
          <Turnstile key={challenge} onToken={setToken} />
        )}
        {message ? <p className="text-sm text-destructive">{message}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          {!result ? (
            <Button disabled={!token} onClick={() => void createClaim()}>
              Create challenge
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddToCollectionDialog({ pluginId }: { pluginId: string }) {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const collections = useQuery({
    queryKey: apiKeys.endpoint("/api/me/collections"),
    queryFn: ({ signal }) =>
      apiRequest(
        "/api/me/collections",
        z.object({ items: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()) }),
        { signal },
      ),
    enabled: open && Boolean(session.data),
  });
  const mutation = useMutation({
    mutationFn: (collectionId: string) =>
      apiRequest(`/api/me/collections/${collectionId}/plugins/${pluginId}`, apiSchemas.object, {
        method: "PUT",
        json: {
          turnstileToken: token,
          idempotencyKey: writeKey("collection-plugin"),
        },
      }),
  });
  const items = collections.data?.items ?? (collections.isError ? [] : null);

  if (!hydrated || !session.data) return null;

  async function add(collectionId: string) {
    try {
      await mutation.mutateAsync(collectionId);
      setMessage("Plugin added to the collection.");
    } catch (error) {
      setMessage(messageFrom(error, "Could not add plugin."));
    }
    setToken("");
    setChallenge((value) => value + 1);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <FolderPlus data-icon="inline-start" /> Add to collection
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to a collection</DialogTitle>
          <DialogDescription>
            Collections are public by default. You can make them private from the Collections page
            in your account.
          </DialogDescription>
        </DialogHeader>
        <Turnstile key={challenge} onToken={setToken} />
        <div className="divide-y divide-border border-y border-border">
          {items?.length ? (
            items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm font-medium">{item.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!token}
                  onClick={() => void add(item.id)}
                >
                  Add
                </Button>
              </div>
            ))
          ) : (
            <p className="py-6 text-sm text-muted-foreground">
              {items ? "Create a collection from your account first." : "Loading collections…"}
            </p>
          )}
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </DialogContent>
    </Dialog>
  );
}

export function UserSafetyActions({ userId }: { userId: string }) {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const [blocked, setBlocked] = useState(false);
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const mutation = useMutation({
    mutationFn: (nextBlocked: boolean) =>
      apiRequest(`/api/me/blocks/${userId}`, apiSchemas.object, {
        method: nextBlocked ? "PUT" : "DELETE",
        json: {
          turnstileToken: token,
          idempotencyKey: writeKey("user-block"),
        },
      }),
  });
  if (!hydrated || !session.data || session.data.user.id === userId) return null;

  async function toggleBlock() {
    const nextBlocked = !blocked;
    try {
      await mutation.mutateAsync(nextBlocked);
      setBlocked(nextBlocked);
    } catch {
      // Existing UI intentionally provides no additional block error surface.
    }
    setToken("");
    setChallenge((value) => value + 1);
  }

  return (
    <div className="mt-6 flex flex-wrap items-start gap-2">
      <Button variant="outline" size="sm" disabled={!token} onClick={() => void toggleBlock()}>
        <Ban data-icon="inline-start" /> {blocked ? "Unblock" : "Block"}
      </Button>
      <ReportDialog targetType="profile" targetId={userId} label="Report profile" />
      <div className="basis-full">
        <Turnstile key={challenge} onToken={setToken} />
      </div>
    </div>
  );
}

export function PublisherFollowButton({ publisherId }: { publisherId: string }) {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const queryClient = useQueryClient();
  const relationships = useQuery({
    queryKey: apiKeys.relationships,
    queryFn: ({ signal }) =>
      apiRequest("/api/me/relationships", apiSchemas.relationships, { signal }),
    enabled: Boolean(session.data),
  });
  const followed =
    relationships.data?.publisherFollows.some((item) => item["id"] === publisherId) ?? false;
  const mutation = useMutation({
    mutationFn: (nextFollowed: boolean) =>
      apiRequest(`/api/me/publishers/${publisherId}/follow`, apiSchemas.object, {
        method: nextFollowed ? "PUT" : "DELETE",
        json: {
          turnstileToken: token,
          idempotencyKey: writeKey("publisher-follow"),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: apiKeys.relationships });
    },
  });

  if (!hydrated || !session.data) return null;

  async function toggle() {
    try {
      await mutation.mutateAsync(!followed);
    } catch {
      // Existing UI intentionally provides no additional follow error surface.
    }
    setToken("");
    setChallenge((value) => value + 1);
  }

  return (
    <div className="mt-6">
      <Button
        variant={followed ? "secondary" : "outline"}
        disabled={!token}
        onClick={() => void toggle()}
      >
        <Bell data-icon="inline-start" /> {followed ? "Following publisher" : "Follow publisher"}
      </Button>
      <div className="mt-3">
        <Turnstile key={challenge} onToken={setToken} />
      </div>
    </div>
  );
}
