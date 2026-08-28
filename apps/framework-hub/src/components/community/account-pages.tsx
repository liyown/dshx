import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z, type ZodType } from "zod";

import { AccountAccess, AccountLoading, AccountShell } from "./account-shell";
import { Turnstile } from "./turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/use-i18n";
import { apiKeys, apiRequest, apiSchemas } from "@/lib/api-client";
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

type JsonMutationInput = {
  readonly path: string;
  readonly method: "POST" | "PUT" | "PATCH" | "DELETE";
  readonly json: unknown;
  readonly schema: ZodType;
};

function useJsonMutation() {
  return useMutation<unknown, Error, JsonMutationInput>({
    mutationFn: ({ path, method, json, schema }) => apiRequest(path, schema, { method, json }),
  });
}

function randomKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

export function AccountOverview() {
  const { data, error } = useAccountEndpoint<{
    bookmarks: Array<Record<string, unknown>>;
    pluginFollows: Array<Record<string, unknown>>;
    publisherFollows: Array<Record<string, unknown>>;
  }>("/api/me/relationships", apiSchemas.relationships);
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
  const { data, error, reload } = useAccountEndpoint<{ items: Array<Record<string, unknown>> }>(
    "/api/me/notifications",
    apiSchemas.itemPage,
  );
  const mutation = useJsonMutation();
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  async function read(id: string) {
    await mutation.mutateAsync({
      path: `/api/me/notifications/${id}/read`,
      method: "PUT",
      json: { turnstileToken: token, idempotencyKey: randomKey("notification") },
      schema: apiSchemas.object,
    });
    setToken("");
    setChallenge((value) => value + 1);
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
            <Turnstile key={challenge} onToken={setToken} />
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
                      disabled={!token}
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
  const { data, error, reload } = useAccountEndpoint<{ items: Array<Record<string, unknown>> }>(
    "/api/me/submissions",
    apiSchemas.itemPage,
  );
  const mutation = useJsonMutation();
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  async function submit() {
    try {
      await mutation.mutateAsync({
        path: "/api/me/submissions",
        method: "POST",
        json: {
          repositoryUrl,
          turnstileToken: token,
          idempotencyKey: randomKey("submission"),
        },
        schema: apiSchemas.object,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Submission failed.");
      setToken("");
      setChallenge((value) => value + 1);
      return;
    }
    setToken("");
    setChallenge((value) => value + 1);
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
            <Turnstile key={challenge} onToken={setToken} />
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            <Button disabled={!repositoryUrl || !token} onClick={() => void submit()}>
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
  const { data, error, reload } = useAccountEndpoint<{ items: Array<Record<string, unknown>> }>(
    "/api/me/collections",
    apiSchemas.itemPage,
  );
  const mutation = useJsonMutation();
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  async function create() {
    try {
      await mutation.mutateAsync({
        path: "/api/me/collections",
        method: "POST",
        json: {
          name,
          visibility: "public",
          turnstileToken: token,
          idempotencyKey: randomKey("collection"),
        },
        schema: apiSchemas.object,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Collection could not be created.");
      setToken("");
      setChallenge((value) => value + 1);
      return;
    }
    setName("");
    setToken("");
    setChallenge((value) => value + 1);
    setMessage("Public collection created.");
    await reload();
  }
  async function toggleVisibility(item: Record<string, unknown>) {
    const next = item["visibility"] === "public" ? "private" : "public";
    let changed = false;
    try {
      await mutation.mutateAsync({
        path: `/api/me/collections/${String(item["id"])}`,
        method: "PATCH",
        json: {
          visibility: next,
          turnstileToken: token,
          idempotencyKey: randomKey("collection-visibility"),
        },
        schema: apiSchemas.object,
      });
      changed = true;
      setMessage(`Collection is now ${next}.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Collection privacy could not be changed.",
      );
    }
    setToken("");
    setChallenge((value) => value + 1);
    if (changed) await reload();
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
            <Turnstile key={challenge} onToken={setToken} />
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            <Button disabled={!name.trim() || !token} onClick={() => void create()}>
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
                    <a
                      href={`/${locale}/collections/${String(item["id"])}`}
                      className="text-sm font-medium hover:text-accent"
                    >
                      {String(item["name"])}
                    </a>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {String(item["visibility"])} · {String(item["plugin_count"] ?? 0)} plugins
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!token}
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
  const { data, error, reload } = useAccountEndpoint<{ items: Array<Record<string, unknown>> }>(
    "/api/me/appeals",
    apiSchemas.itemPage,
  );
  const mutation = useJsonMutation();
  const [actionId, setActionId] = useState("");
  const [statement, setStatement] = useState("");
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  async function submit() {
    await mutation.mutateAsync({
      path: "/api/me/appeals",
      method: "POST",
      json: {
        moderationActionId: actionId,
        statement,
        turnstileToken: token,
        idempotencyKey: randomKey("appeal"),
      },
      schema: apiSchemas.object,
    });
    setActionId("");
    setStatement("");
    setToken("");
    setChallenge((value) => value + 1);
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
            <Turnstile key={challenge} onToken={setToken} />
            <Button
              disabled={!actionId || statement.length < 20 || !token}
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
  const { data, error, reload } = useAccountEndpoint<Record<string, unknown>>(
    "/api/me/profile",
    apiSchemas.object,
  );
  const mutation = useJsonMutation();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    if (data) {
      setName(String(data["display_name"] ?? data["name"] ?? ""));
      setBio(String(data["bio"] ?? ""));
    }
  }, [data]);
  async function save() {
    await mutation.mutateAsync({
      path: "/api/me/profile",
      method: "PUT",
      json: {
        displayName: name,
        bio,
        preferredLocale: data?.["preferred_locale"] === "zh" ? "zh" : "en",
        turnstileToken: token,
        idempotencyKey: randomKey("profile"),
      },
      schema: apiSchemas.object,
    });
    setToken("");
    setChallenge((value) => value + 1);
    await reload();
  }
  async function removeAccount() {
    await mutation.mutateAsync({
      path: "/api/me/account",
      method: "DELETE",
      json: {
        confirmation: "DELETE",
        turnstileToken: token,
        idempotencyKey: randomKey("account-delete"),
      },
      schema: z.object({ deleted: z.boolean(), anonymized: z.boolean() }),
    });
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
            <Turnstile key={challenge} onToken={setToken} />
            <Button disabled={!name.trim() || !token} onClick={() => void save()}>
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
                  disabled={confirmation !== "DELETE" || !token}
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
