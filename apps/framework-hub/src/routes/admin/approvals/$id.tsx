import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, RotateCcw } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { ApprovalDecisionDialog } from "@/components/admin/approval-decision-dialog";
import {
  AdminAccessError,
  AdminHeader,
  type ApprovalDetail,
  LoadingLedger,
  RelativeTime,
  RiskBadge,
  StatusBadge,
} from "@/components/admin/approval-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { hasAdminAccess } from "@/lib/auth/functions";
import { apiKeys, apiRequest } from "@/lib/api-client";

const approvalDetailSchema = z
  .object({
    request: z.looseObject({}),
    current: z.looseObject({}),
    effect: z.looseObject({}),
    versions: z.array(z.looseObject({})),
    decisions: z.array(z.looseObject({})),
    events: z.array(z.looseObject({})),
    attempts: z.array(z.looseObject({})),
  })
  .transform((value) => value as unknown as ApprovalDetail);

export const Route = createFileRoute("/admin/approvals/$id")({
  loader: async () => {
    if (!(await hasAdminAccess()))
      throw redirect({ to: "/$locale/account", params: { locale: "en" } });
  },
  head: () => ({
    meta: [
      { title: "Approval detail · DSHX Hub" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ApprovalDetailPage,
});

function ApprovalDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: apiKeys.approval(id),
    queryFn: ({ signal }) =>
      apiRequest(`/api/admin/approvals/${encodeURIComponent(id)}`, approvalDetailSchema, {
        signal,
      }),
  });
  const updateApproval = (data: ApprovalDetail) => {
    queryClient.setQueryData(apiKeys.approval(id), data);
    setActionError(null);
  };
  const decisionMutation = useMutation({
    mutationFn: (input: { action: "approve" | "reject" | "request_changes"; reason: string }) =>
      apiRequest(`/api/admin/approvals/${encodeURIComponent(id)}/decisions`, approvalDetailSchema, {
        method: "POST",
        json: { action: input.action, ...(input.reason ? { reason: input.reason } : {}) },
      }),
    onSuccess: updateApproval,
  });
  const retryMutation = useMutation({
    mutationFn: (reason: string) =>
      apiRequest(
        `/api/admin/approvals/${encodeURIComponent(id)}/effects/retry`,
        approvalDetailSchema,
        { method: "POST", json: { ...(reason ? { reason } : {}) } },
      ),
    onSuccess: updateApproval,
  });
  const data = query.data ?? null;
  const error = actionError ?? (query.error instanceof Error ? query.error.message : null);
  const pending = decisionMutation.isPending || retryMutation.isPending;

  async function decide(action: "approve" | "reject" | "request_changes", reason: string) {
    try {
      await decisionMutation.mutateAsync({ action, reason });
    } catch (decisionError) {
      setActionError(
        decisionError instanceof Error ? decisionError.message : "The decision failed.",
      );
      throw decisionError;
    }
  }

  async function retry(reason: string) {
    try {
      await retryMutation.mutateAsync(reason);
    } catch (retryError) {
      setActionError(retryError instanceof Error ? retryError.message : "The effect retry failed.");
      throw retryError;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader back />
      <main className="mx-auto max-w-[1440px] px-5 py-10 lg:px-8">
        {error && !data ? <AdminAccessError message={error} /> : null}
        {!error && !data ? <LoadingLedger /> : null}
        {data ? (
          <ApprovalDetailView
            data={data}
            error={error}
            pending={pending}
            onDecision={decide}
            onRetry={retry}
          />
        ) : null}
      </main>
    </div>
  );
}

function ApprovalDetailView({
  data,
  error,
  pending,
  onDecision,
  onRetry,
}: {
  data: ApprovalDetail;
  error: string | null;
  pending: boolean;
  onDecision: (action: "approve" | "reject" | "request_changes", reason: string) => Promise<void>;
  onRetry: (reason: string) => Promise<void>;
}) {
  const { request, current, effect } = data;
  const canDecide = request.status === "pending";
  const canRetry = request.status === "approved" && effect.status === "failed";

  return (
    <>
      <div className="grid gap-8 border-b border-border pb-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge risk={request.risk} />
            <StatusBadge status={request.status} />
            <StatusBadge status={effect.status} />
          </div>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.035em]">
            {current.title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            {current.summary}
          </p>
        </div>
        <dl className="grid grid-cols-[110px_1fr] content-start gap-x-4 gap-y-3 border-l-0 text-sm lg:border-l lg:border-border lg:pl-7">
          <dt className="text-muted-foreground">Request</dt>
          <dd className="truncate font-mono text-xs">{request.id}</dd>
          <dt className="text-muted-foreground">Version</dt>
          <dd>v{request.current_version}</dd>
          <dt className="text-muted-foreground">Policy</dt>
          <dd className="font-mono text-xs">{current.policy_version}</dd>
          <dt className="text-muted-foreground">Expires</dt>
          <dd>
            <RelativeTime value={request.expires_at} />
          </dd>
          <dt className="text-muted-foreground">Source hash</dt>
          <dd className="truncate font-mono text-xs" title={current.source_hash}>
            {current.source_hash}
          </dd>
        </dl>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <CircleAlert className="size-4" />
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-10 py-10 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-10">
          <EvidenceSection
            title="Proposed effect"
            eyebrow={effect.effect_kind.replaceAll("_", " ")}
          >
            <ol className="divide-y divide-border border-y border-border">
              {current.preview.map((line, index) => (
                <li
                  key={`${index}-${line.label}`}
                  className="grid gap-2 py-4 text-sm leading-6 sm:grid-cols-[2rem_10rem_1fr]"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-muted-foreground">{line.label}</span>
                  <span className="font-medium">{line.value}</span>
                </li>
              ))}
            </ol>
            <JsonBlock value={current.effectInput} />
          </EvidenceSection>

          <EvidenceSection title="Evidence snapshot" eyebrow="immutable">
            <JsonBlock value={current.evidence} />
          </EvidenceSection>

          <EvidenceSection title="State preconditions" eyebrow="checked before execution">
            <JsonBlock value={current.preconditions} />
          </EvidenceSection>

          <EvidenceSection title="Version history" eyebrow={`${data.versions.length} revisions`}>
            <AuditRows rows={data.versions} empty="No version history was recorded." />
          </EvidenceSection>
        </div>

        <aside className="space-y-8 xl:border-l xl:border-border xl:pl-8">
          <section>
            <h2 className="text-sm font-semibold">Decision</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Parameters are immutable. If the evidence is incomplete, request a new version instead
              of editing the effect.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <ApprovalDecisionDialog
                action="approve"
                disabled={!canDecide}
                pending={pending}
                onConfirm={(reason) => onDecision("approve", reason)}
              />
              <ApprovalDecisionDialog
                action="request_changes"
                disabled={!canDecide}
                pending={pending}
                onConfirm={(reason) => onDecision("request_changes", reason)}
              />
              <ApprovalDecisionDialog
                action="reject"
                disabled={!canDecide}
                pending={pending}
                onConfirm={(reason) => onDecision("reject", reason)}
              />
              {canRetry ? (
                <ApprovalDecisionDialog action="retry" pending={pending} onConfirm={onRetry} />
              ) : null}
            </div>
          </section>

          <Separator />

          <section>
            <h2 className="text-sm font-semibold">Execution</h2>
            <dl className="mt-4 grid grid-cols-[110px_1fr] gap-x-3 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Mode</dt>
              <dd>{request.execution_mode}</dd>
              <dt className="text-muted-foreground">Attempts</dt>
              <dd>{effect.attempt_count}</dd>
              <dt className="text-muted-foreground">Lease expires</dt>
              <dd>
                <RelativeTime value={effect.lease_expires_at} />
              </dd>
              <dt className="text-muted-foreground">Historical run reference</dt>
              <dd>
                {request.run_id ? <span className="font-mono text-xs">{request.run_id}</span> : "—"}
              </dd>
            </dl>
            {effect.last_error ? (
              <div className="mt-4 border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {effect.last_error}
              </div>
            ) : null}
          </section>

          <Separator />

          <EvidenceSection
            title="Effect attempts"
            eyebrow={`${data.attempts.length} recorded`}
            compact
          >
            <AuditRows rows={data.attempts} empty="This effect has not run." />
          </EvidenceSection>

          <EvidenceSection title="Decisions" eyebrow={`${data.decisions.length} recorded`} compact>
            <AuditRows rows={data.decisions} empty="No administrator decision yet." />
          </EvidenceSection>

          <EvidenceSection title="Event log" eyebrow={`${data.events.length} events`} compact>
            <AuditRows rows={data.events} empty="No events were recorded." />
          </EvidenceSection>
        </aside>
      </div>
    </>
  );
}

function EvidenceSection({
  title,
  eyebrow,
  compact,
  children,
}: {
  title: string;
  eyebrow: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={compact ? "space-y-3" : "space-y-5"}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className={compact ? "text-sm font-semibold" : "text-xl font-semibold tracking-tight"}>
          {title}
        </h2>
        <span className="text-right font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {eyebrow}
        </span>
      </div>
      {children}
    </section>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[520px] overflow-auto rounded-md border border-ink-border bg-ink p-5 font-mono text-xs leading-6 text-ink-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function AuditRows({ rows, empty }: { rows: Array<Record<string, unknown>>; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="divide-y divide-border border-y border-border">
      {rows.map((row, index) => {
        const created = Number(row["created_at"] ?? row["started_at"] ?? 0) || null;
        const label = String(
          row["kind"] ?? row["action"] ?? row["status"] ?? `Record ${index + 1}`,
        );
        return (
          <details key={`${index}-${label}`} className="group py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm">
              <span className="flex items-center gap-2">
                {row["status"] === "failed" ? (
                  <RotateCcw className="size-3.5 text-destructive" />
                ) : null}
                {label.replaceAll("_", " ")}
              </span>
              <span className="text-xs text-muted-foreground">
                <RelativeTime value={created} />
              </span>
            </summary>
            <pre className="mt-3 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-5">
              {JSON.stringify(row, null, 2)}
            </pre>
          </details>
        );
      })}
    </div>
  );
}
