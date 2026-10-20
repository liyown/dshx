import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";

import { AdminHeader } from "@/components/admin/approval-ui";
import { CopyOperationsPrompt } from "@/components/dshx/copy-operations-prompt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api-client";
import { hasAdminAccess } from "@/lib/auth/functions";

const resourceStatusSchema = z.object({
  key: z.string(),
  env: z.string(),
  label: z.string(),
  description: z.string(),
  configured: z.boolean(),
  updatedAt: z.string().nullable(),
});

const adminPromptSchema = z.object({
  bootstrap: z.string(),
  prompt: z.string(),
  meta: z.object({
    promptVersion: z.number(),
    cliVersion: z.string(),
    cliChannel: z.string(),
    capabilitiesHash: z.string(),
    contentSha256: z.string(),
    sourceUrl: z.string(),
    npxCommand: z.string(),
  }),
  resources: z.array(resourceStatusSchema),
});

const resourceSaveSchema = z.object({
  resources: z.array(resourceStatusSchema),
});

type ResourceStatus = z.infer<typeof resourceStatusSchema>;

export const Route = createFileRoute("/admin/agent-prompt")({
  loader: async () => {
    if (!(await hasAdminAccess()))
      throw redirect({ to: "/$locale/account", params: { locale: "en" } });
  },
  head: () => ({
    meta: [
      { title: "Operator prompt · DSHX Hub" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AgentPromptPage,
});

function ResourceEditor({
  resource,
  onSaved,
}: {
  resource: ResourceStatus;
  onSaved: (resources: ResourceStatus[]) => void;
}) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: { key: string; value?: string; clear?: boolean }) =>
      apiRequest("/api/admin/agent-prompt/resources", resourceSaveSchema, {
        method: "PUT",
        json: input,
      }),
    onSuccess: (data, input) => {
      setValue("");
      setMessage(input.clear === true ? "Cleared." : "Saved.");
      onSaved(data.resources);
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    },
  });

  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{resource.label}</h3>
            <Badge variant="outline" className="font-mono font-normal">
              {resource.env}
            </Badge>
            <Badge
              variant="outline"
              className={
                resource.configured
                  ? "border-ok/40 bg-ok/10 font-mono font-normal"
                  : "font-mono font-normal text-muted-foreground"
              }
            >
              {resource.configured ? "configured" : "not configured"}
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{resource.description}</p>
          {resource.updatedAt ? (
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              Updated {new Date(resource.updatedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={resource.configured ? "Enter a replacement value" : "Enter a value"}
          className="font-mono"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={mutation.isPending || value.trim() === ""}
            onClick={() => {
              setMessage(null);
              mutation.mutate({ key: resource.key, value });
            }}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
          {resource.configured ? (
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => {
                setMessage(null);
                mutation.mutate({ key: resource.key, clear: true });
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Values are encrypted before storage and are never shown again. The Agent receives them only
        through the authenticated bundle endpoint.
      </p>
    </div>
  );
}

function AgentPromptPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "agent-prompt"],
    queryFn: ({ signal }) => apiRequest("/api/admin/agent-prompt", adminPromptSchema, { signal }),
  });
  const data = query.data;
  const [resources, setResources] = useState<ResourceStatus[]>([]);

  useEffect(() => {
    if (data) setResources(data.resources);
  }, [data]);

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader title="Operator prompt" />
      <main className="mx-auto max-w-[1440px] px-5 py-12 lg:px-8">
        <div className="flex flex-col justify-between gap-6 border-b border-border pb-8 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">
              Administrator only
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.035em]">
              Operator prompt and resources
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Preview the version-pinned Agent prompt and configure allowlisted resources. The Agent
              fetches the prompt and resources together with an administrator CLI credential; this
              page never exposes stored secret values.
            </p>
          </div>
          <div className="text-left md:text-right">
            <div className="font-mono text-sm">CLI {data?.meta.cliVersion ?? "—"}</div>
            <div className="font-mono text-sm text-muted-foreground">
              prompt v{data?.meta.promptVersion ?? "—"}
            </div>
            <Link
              to="/admin/approvals"
              className="mt-2 inline-block text-sm text-muted-foreground hover:text-foreground"
            >
              Back to approval queue
            </Link>
          </div>
        </div>

        {query.isError ? (
          <p className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
            {query.error instanceof Error
              ? query.error.message
              : "Could not load the operator prompt."}
          </p>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Resources</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            The Agent runs <code className="font-mono">ops bundle</code> with an administrator CLI
            token. Resource values are decrypted only for that authenticated response and are
            written to a private local file.
          </p>
          <div className="mt-4 grid gap-4">
            {resources.map((resource: ResourceStatus) => (
              <ResourceEditor
                key={resource.key}
                resource={resource}
                onSaved={(next: ResourceStatus[]) => {
                  setResources(next);
                  void queryClient.invalidateQueries({
                    queryKey: ["admin", "agent-prompt"],
                  });
                }}
              />
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-border bg-surface-2 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Agent fetch command
            </p>
            <pre className="mt-2 overflow-x-auto font-mono text-[12.5px]">
              {`npx --yes --package @becomeopc/dshx-hub-cli@${data?.meta.cliChannel ?? "preview"} dshx-hub ops bundle --output /absolute/private/path/agent-bundle.json`}
            </pre>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Bootstrap prompt</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Copy this short prompt to the operations Agent. It fetches the latest full
                instructions, version metadata, and resources from the authenticated bundle at the
                start of each run.
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                capabilities {data?.meta.capabilitiesHash ?? "—"}
              </p>
            </div>
            {data ? <CopyOperationsPrompt prompt={data.bootstrap} variant="outline" /> : null}
          </div>
          <pre className="mt-4 max-h-[45vh] overflow-auto rounded-xl border border-border bg-surface p-5 font-mono text-[12px] leading-6 whitespace-pre-wrap">
            {data?.bootstrap ?? "Loading bootstrap prompt…"}
          </pre>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Full prompt</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            This is the current full operations prompt returned by{" "}
            <code className="font-mono">ops bundle</code>. The Agent should not copy it manually;
            the authenticated bundle is the source of truth.
          </p>
          <pre className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-border bg-surface p-5 font-mono text-[12px] leading-6 whitespace-pre-wrap">
            {data?.prompt ?? "Loading prompt…"}
          </pre>
        </section>
      </main>
    </div>
  );
}
