import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type ZodType } from "zod";

import { AccountAccess, AccountLoading, AccountShell } from "./account-shell";
import { Turnstile } from "./turnstile";
import { useVerification, useVerifiedWrite } from "./verified-write";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/use-i18n";
import { apiKeys, apiRequest } from "@/lib/api-client";
import {
  accountDeletionSchema,
  appealSchema,
  appealsPageSchema,
  collectionDetailSchema,
  collectionsPageSchema,
  notificationReadResultSchema,
  notificationsPageSchema,
  profileSchema,
  relationshipsSchema,
  submissionSchema,
  submissionsPageSchema,
} from "@/lib/community/contracts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function useAccountEndpoint<T>(endpoint: string, schema: ZodType<T>) {
  const query = useQuery({
    queryKey: apiKeys.endpoint(endpoint),
    queryFn: ({ signal }) => apiRequest(endpoint, schema, { signal }),
  });
  return {
    data: query.data ?? null,
    error: query.error instanceof Error ? query.error.message : null,
    reload: async () => {
      await query.refetch();
    },
  };
}

export function AccountOverview() {
  const { data, error } = useAccountEndpoint("/api/me/relationships", relationshipsSchema);
  return (
    <AccountShell
      title="Your marketplace"
      intro="Bookmarks are public by default. Following a plugin or publisher creates notifications without adding the action to a public activity feed."
    >
      {error ? (
        <AccountAccess message={error} />
      ) : !data ? (
        <AccountLoading />
      ) : (
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            ["Bookmarks", data.bookmarks.length],
            ["Plugin follows", data.pluginFollows.length],
            ["Publisher follows", data.publisherFollows.length],
          ].map(([label, count]) => (
            <div key={String(label)} className="border-t border-border pt-4">
              <div className="font-mono text-3xl">{count}</div>
              <div className="mt-1 text-sm text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      )}
    </AccountShell>
  );
}

export function NotificationsPage() {
  const { data, error, reload } = useAccountEndpoint(
    "/api/me/notifications",
    notificationsPageSchema,
  );
  const verification = useVerification();
  const markRead = useVerifiedWrite({
    verification,
    path: (id: string) => `/api/me/notifications/${id}/read`,
    schema: notificationReadResultSchema,
    method: "PUT",
    keyPrefix: "notification",
    body: (_input: string, secrets) => ({ ...secrets }),
  });
  async function read(id: string) {
    try {
      await markRead.submit(id);
    } catch {
      // The row stays unread and its button stays available for another try.
      return;
    }
    await reload();
  }
  return (
    <AccountShell
      title="Notifications"
      intro="Approval decisions, moderation outcomes, plugin releases and followed publisher events appear here."
    >
      {error ? (
        <AccountAccess message={error} />
      ) : !data ? (
        <AccountLoading />
      ) : (
        <>
          <div className="mb-5">
            <Turnstile key={verification.widgetKey} onToken={verification.receive} />
          </div>
          <div className="divide-y divide-border border-y border-border">
            {data.items.length ? (
              data.items.map((item) => (
                <div key={String(item["id"])} className="flex gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{String(item["kind"]).replaceAll("_", " ")}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {String(item["subject_type"])} · {String(item["subject_id"])}
                    </div>
                  </div>
                  {Number(item["is_read"]) === 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!verification.token || markRead.pending}
                      onClick={() => void read(String(item["id"]))}
                    >
                      Mark read
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Read</span>
                  )}
                </div>
              ))
            ) : (
              <p className="py-10 text-sm text-muted-foreground">No notifications yet.</p>
            )}
          </div>
        </>
      )}
    </AccountShell>
  );
}

export function SubmissionsPage() {
  const { data, error, reload } = useAccountEndpoint("/api/me/submissions", submissionsPageSchema);
  const verification = useVerification();
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const submissionWrite = useVerifiedWrite({
    verification,
    path: () => "/api/me/submissions",
    schema: submissionSchema,
    keyPrefix: "submission",
    body: (url: string, secrets) => ({ repositoryUrl: url, ...secrets }),
  });
  async function submitRepository() {
    try {
      await submissionWrite.submit(repositoryUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Submission failed.");
      return;
    }
    setRepositoryUrl("");
    setMessage("Repository queued for the operations Agent.");
    await reload();
  }
  return (
    <AccountShell
      title="Plugin submissions"
      intro="Submit the root of a public GitHub repository. The operations Agent reviews it as a plugin, records sourced metadata and publishes it when the catalog entry is complete."
    >
      {error ? (
        <AccountAccess message={error} />
      ) : !data ? (
        <AccountLoading />
      ) : (
        <>
          <div className="space-y-4 border-b border-border pb-8">
            <Label htmlFor="repository">GitHub repository URL</Label>
            <Input
              id="repository"
              type="url"
              value={repositoryUrl}
              onChange={(event) => setRepositoryUrl(event.target.value)}
              placeholder="https://github.com/owner/repository"
            />
            <Turnstile key={verification.widgetKey} onToken={verification.receive} />
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            <Button
              disabled={!repositoryUrl || !verification.token || submissionWrite.pending}
              onClick={() => void submitRepository()}
            >
              Submit repository
            </Button>
          </div>
          <RecordList
            items={data.items}
            empty="No submissions yet."
            primary="repository_full_name"
            secondary="status"
          />
        </>
      )}
    </AccountShell>
  );
}

export function CollectionsPage() {
  const { locale } = useI18n();
  const { data, error, reload } = useAccountEndpoint("/api/me/collections", collectionsPageSchema);
  const verification = useVerification();
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const createCollection = useVerifiedWrite({
    verification,
    path: () => "/api/me/collections",
    schema: collectionDetailSchema,
    keyPrefix: "collection",
    body: (nextName: string, secrets) => ({ name: nextName, visibility: "public", ...secrets }),
  });
  const setVisibility = useVerifiedWrite({
    verification,
    path: (input: { id: string; visibility: "public" | "private" }) =>
      `/api/me/collections/${input.id}`,
    schema: collectionDetailSchema,
    method: "PATCH",
    keyPrefix: "collection-visibility",
    body: (input, secrets) => ({ visibility: input.visibility, ...secrets }),
  });
  async function create() {
    try {
      await createCollection.submit(name);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Collection could not be created.");
      return;
    }
    setName("");
    setMessage("Public collection created.");
    await reload();
  }
  async function toggleVisibility(item: Record<string, unknown>) {
    const visibility = item["visibility"] === "public" ? "private" : "public";
    try {
      await setVisibility.submit({ id: String(item["id"]), visibility });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Collection privacy could not be changed.",
      );
      return;
    }
    setMessage(`Collection is now ${visibility}.`);
    await reload();
  }
  return (
    <AccountShell
      title="Collections"
      intro="Collections are public by default and can be switched to private. Public collections appear on your profile."
    >
      {error ? (
        <AccountAccess message={error} />
      ) : !data ? (
        <AccountLoading />
      ) : (
        <>
          <div className="space-y-4 border-b border-border pb-8">
            <Label htmlFor="collection-name">Collection name</Label>
            <Input
              id="collection-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
            />
            <Turnstile key={verification.widgetKey} onToken={verification.receive} />
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            <Button
              disabled={!name.trim() || !verification.token || createCollection.pending}
              onClick={() => void create()}
            >
              Create public collection
            </Button>
          </div>
          <div className="mt-8 divide-y divide-border border-y border-border">
            {data.items.length ? (
              data.items.map((item) => (
                <div
                  key={String(item["id"])}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <Link
                      to="/$locale/collections/$id"
                      params={{ locale, id: String(item["id"]) }}
                      className="text-sm font-medium hover:text-accent"
                    >
                      {String(item["name"])}
                    </Link>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {String(item["visibility"])} · {String(item["plugin_count"] ?? 0)} plugins
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!verification.token || setVisibility.pending}
                    onClick={() => void toggleVisibility(item)}
                  >
                    Make {item["visibility"] === "public" ? "private" : "public"}
                  </Button>
                </div>
              ))
            ) : (
              <p className="py-10 text-sm text-muted-foreground">No collections yet.</p>
            )}
          </div>
        </>
      )}
    </AccountShell>
  );
}

export function AppealsPage() {
  const { data, error, reload } = useAccountEndpoint("/api/me/appeals", appealsPageSchema);
  const verification = useVerification();
  const [actionId, setActionId] = useState("");
  const [statement, setStatement] = useState("");
  const appeal = useVerifiedWrite({
    verification,
    path: () => "/api/me/appeals",
    schema: appealSchema,
    keyPrefix: "appeal",
    body: (input: { actionId: string; statement: string }, secrets) => ({
      moderationActionId: input.actionId,
      statement: input.statement,
      ...secrets,
    }),
  });
  async function submit() {
    await appeal.submit({ actionId, statement });
    setActionId("");
    setStatement("");
    await reload();
  }
  return (
    <AccountShell
      title="Appeals"
      intro="Submitting an appeal starts a high-risk approval. Before reversing a sanction, an administrator reviews its immutable evidence snapshot."
    >
      {error ? (
        <AccountAccess message={error} />
      ) : !data ? (
        <AccountLoading />
      ) : (
        <>
          <div className="space-y-4 border-b border-border pb-8">
            <div>
              <Label htmlFor="action-id">Moderation action ID</Label>
              <Input
                id="action-id"
                value={actionId}
                onChange={(event) => setActionId(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="appeal-statement">Statement</Label>
              <Textarea
                id="appeal-statement"
                value={statement}
                onChange={(event) => setStatement(event.target.value)}
                minLength={20}
                maxLength={4000}
              />
            </div>
            <Turnstile key={verification.widgetKey} onToken={verification.receive} />
            <Button
              disabled={!actionId || statement.length < 20 || !verification.token || appeal.pending}
              onClick={() => void submit()}
            >
              Submit appeal
            </Button>
          </div>
          <RecordList
            items={data.items}
            empty="No appeals yet."
            primary="statement"
            secondary="approval_status"
          />
        </>
      )}
    </AccountShell>
  );
}

export function SettingsPage() {
  const { data, error, reload } = useAccountEndpoint("/api/me/profile", profileSchema);
  const verification = useVerification();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const saveProfile = useVerifiedWrite({
    verification,
    path: () => "/api/me/profile",
    schema: profileSchema,
    method: "PUT",
    keyPrefix: "profile",
    body: (input: { displayName: string; bio: string; preferredLocale: "en" | "zh" }, secrets) => ({
      ...input,
      ...secrets,
    }),
  });
  const deleteAccount = useVerifiedWrite({
    verification,
    path: () => "/api/me/account",
    schema: accountDeletionSchema,
    method: "DELETE",
    keyPrefix: "account-delete",
    body: (_input: void, secrets) => ({ confirmation: "DELETE", ...secrets }),
  });
  useEffect(() => {
    if (data) {
      setName(String(data["display_name"] ?? data["name"] ?? ""));
      setBio(String(data["bio"] ?? ""));
    }
  }, [data]);
  async function save() {
    await saveProfile.submit({
      displayName: name,
      bio,
      preferredLocale: data?.["preferred_locale"] === "zh" ? "zh" : "en",
    });
    await reload();
  }
  async function removeAccount() {
    await deleteAccount.submit();
    window.location.assign("/en");
  }
  return (
    <AccountShell
      title="Profile settings"
      intro="Your GitHub identity and profile are public. Deleting the account anonymizes public contributions while preserving immutable moderation evidence."
    >
      {error ? (
        <AccountAccess message={error} />
      ) : !data ? (
        <AccountLoading />
      ) : (
        <div className="max-w-xl space-y-8">
          <div className="space-y-5">
            <div>
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={500}
              />
            </div>
            <Turnstile key={verification.widgetKey} onToken={verification.receive} />
            <Button
              disabled={!name.trim() || !verification.token || saveProfile.pending}
              onClick={() => void save()}
            >
              Save profile
            </Button>
          </div>
          <div className="border-t border-destructive/30 pt-7">
            <h2 className="font-medium text-destructive">Delete account</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Sessions, tokens, follows and private data are removed. Public contributions are
              anonymized; immutable moderation and approval records remain.
            </p>
            <Label htmlFor="delete-confirmation" className="mt-4 block">
              Type DELETE
            </Label>
            <Input
              id="delete-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-2"
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="mt-4"
                  disabled={
                    confirmation !== "DELETE" || !verification.token || deleteAccount.pending
                  }
                >
                  Delete account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Permanently anonymize this account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This revokes all access immediately and cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground"
                    onClick={(event) => {
                      event.preventDefault();
                      void removeAccount();
                    }}
                  >
                    Delete and anonymize
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </AccountShell>
  );
}

function RecordList({
  items,
  empty,
  primary,
  secondary,
}: {
  items: Array<Record<string, unknown>>;
  empty: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className="mt-8 divide-y divide-border border-y border-border">
      {items.length ? (
        items.map((item, index) => (
          <div
            key={String(item["id"] ?? index)}
            className="flex items-center justify-between gap-4 py-4"
          >
            <span className="line-clamp-2 text-sm">{String(item[primary] ?? "")}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {String(item[secondary] ?? "")}
            </span>
          </div>
        ))
      ) : (
        <p className="py-10 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
