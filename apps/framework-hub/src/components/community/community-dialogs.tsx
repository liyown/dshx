import { Ban, Bell, Flag, FolderPlus, MessageSquareReply, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

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

type ApiError = { error?: { message?: string } };
type ReportTarget = "plugin" | "review" | "reply" | "profile" | "collection";

function writeKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

function messageFrom(payload: ApiError, fallback: string) {
  return payload.error?.message ?? fallback;
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

  if (!hydrated || !session.data) return null;

  async function submit() {
    setMessage(null);
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetType,
        targetId,
        reason,
        details: details.trim() || null,
        turnstileToken: token,
        idempotencyKey: writeKey("report"),
      }),
    });
    const payload = (await response.json()) as ApiError;
    if (!response.ok) {
      setMessage(messageFrom(payload, "The report could not be submitted."));
    } else {
      setMessage("Report submitted for policy review.");
      setDetails("");
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
            Reports include the current target snapshot. Clear violations may be handled
            automatically; ambiguous cases remain reviewable.
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
  if (!hydrated || !session.data) return null;

  async function submit() {
    const response = await fetch(`/api/reviews/${reviewId}/replies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        locale,
        body,
        turnstileToken: token,
        idempotencyKey: writeKey("reply"),
      }),
    });
    const payload = (await response.json()) as ApiError;
    if (!response.ok) {
      setMessage(messageFrom(payload, "The reply could not be published."));
    } else {
      setBody("");
      setOpen(false);
      onComplete();
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
  if (!hydrated || !session.data) return null;

  async function createClaim() {
    const response = await fetch(`/api/plugins/${encodeURIComponent(slug)}/claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        turnstileToken: token,
        idempotencyKey: writeKey("claim"),
      }),
    });
    const payload = (await response.json()) as ApiError & {
      file?: { path: string; body: Record<string, string> };
    };
    if (!response.ok || !payload.file) {
      setMessage(messageFrom(payload, "The claim challenge could not be created."));
    } else {
      setResult({ file: payload.file });
      setMessage(null);
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
            The challenge expires in 24 hours. Commit the generated file to the repository default
            branch, then verification creates the maintainer relationship.
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
  const [items, setItems] = useState<Array<{ id: string; name: string }> | null>(null);
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !session.data) return;
    void fetch("/api/me/collections")
      .then(
        (response) => response.json() as Promise<{ items: Array<{ id: string; name: string }> }>,
      )
      .then((data) => setItems(data.items))
      .catch(() => setItems([]));
  }, [open, session.data]);

  if (!hydrated || !session.data) return null;

  async function add(collectionId: string) {
    const response = await fetch(`/api/me/collections/${collectionId}/plugins/${pluginId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        turnstileToken: token,
        idempotencyKey: writeKey("collection-plugin"),
      }),
    });
    const payload = (await response.json()) as ApiError;
    setMessage(
      response.ok
        ? "Plugin added to the collection."
        : messageFrom(payload, "Could not add plugin."),
    );
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
            Collections are public by default. Privacy can be changed from account settings.
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
  if (!hydrated || !session.data || session.data.user.id === userId) return null;

  async function toggleBlock() {
    const response = await fetch(`/api/me/blocks/${userId}`, {
      method: blocked ? "DELETE" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        turnstileToken: token,
        idempotencyKey: writeKey("user-block"),
      }),
    });
    if (response.ok) setBlocked(!blocked);
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
  const [followed, setFollowed] = useState(false);
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);

  useEffect(() => {
    if (!session.data) return;
    void fetch("/api/me/relationships")
      .then((response) => response.json() as Promise<{ publisherFollows: Array<{ id: string }> }>)
      .then((page) => setFollowed(page.publisherFollows.some((item) => item.id === publisherId)))
      .catch(() => setFollowed(false));
  }, [publisherId, session.data]);

  if (!hydrated || !session.data) return null;

  async function toggle() {
    const response = await fetch(`/api/me/publishers/${publisherId}/follow`, {
      method: followed ? "DELETE" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        turnstileToken: token,
        idempotencyKey: writeKey("publisher-follow"),
      }),
    });
    if (response.ok) setFollowed(!followed);
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
