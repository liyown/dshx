import { Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, CircleAlert, Clock3, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SignInButton } from "@/components/community/auth-controls";
import { ThemeToggle } from "@/components/dshx/theme-toggle";
import { cn } from "@/lib/utils";

export type ApprovalListItem = {
  id: string;
  kind: string;
  risk: "high" | "critical";
  status: string;
  effect_kind: string;
  effect_status: string;
  subject_type: string;
  subject_id: string;
  title: string;
  summary: string;
  policy_version: string;
  expires_at: number;
  created_at: number;
};

export type ApprovalDetail = {
  request: ApprovalListItem & {
    current_version: number;
    execution_mode: "server" | "agent";
    run_id: string | null;
    requester_type: string;
    requester_id: string | null;
    requester_token_id: string | null;
    decided_by_user_id: string | null;
    decided_at: number | null;
  };
  current: {
    version: number;
    title: string;
    summary: string;
    evidence: unknown;
    effectInput: unknown;
    preconditions: unknown;
    preview: Array<{ label: string; value: string }>;
    source_hash: string;
    policy_version: string;
    created_at: number;
  };
  effect: {
    status: string;
    execution_mode: string;
    effect_kind: string;
    attempt_count: number;
    lease_expires_at: number | null;
    last_error: string | null;
  };
  versions: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  attempts: Array<Record<string, unknown>>;
};

const statusTone: Record<string, string> = {
  pending: "border-warn/40 bg-warn/10 text-foreground",
  changes_requested: "border-accent/30 bg-accent-soft text-foreground",
  approved: "border-ok/40 bg-ok/10 text-foreground",
  succeeded: "border-ok/40 bg-ok/10 text-foreground",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  rejected: "border-border bg-muted text-muted-foreground",
  cancelled: "border-border bg-muted text-muted-foreground",
  expired: "border-border bg-muted text-muted-foreground",
  superseded: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("font-mono font-normal", statusTone[status])}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  return (
    <Badge
      variant={risk === "critical" ? "destructive" : "outline"}
      className="font-mono font-normal uppercase tracking-[0.08em]"
    >
      {risk}
    </Badge>
  );
}

export function AdminHeader({ back }: { back?: boolean }) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-5 lg:px-8">
        <div className="flex items-center gap-3">
          {back ? (
            <Button asChild variant="ghost" size="icon" aria-label="Back to approval queue">
              <Link to="/admin/approvals">
                <ArrowLeft data-icon="inline-start" />
              </Link>
            </Button>
          ) : null}
          <ShieldCheck className="size-5 text-accent" aria-hidden="true" />
          <div className="flex items-baseline gap-2">
            <span className="font-semibold tracking-tight">DSHX Hub</span>
            <span className="text-sm text-muted-foreground">Approval ledger</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a href="/en" className="text-sm text-muted-foreground hover:text-foreground">
            Back to marketplace
          </a>
        </div>
      </div>
    </header>
  );
}

export function ApprovalEmpty({ filtered = false }: { filtered?: boolean }) {
  return (
    <div className="border-y border-border py-20 text-center">
      <CheckCircle2 className="mx-auto size-8 text-ok" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">
        {filtered ? "No approvals match these filters" : "The queue is clear"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {filtered
          ? "Change or clear a filter to see the rest of the approval ledger."
          : "Deterministic operations continue automatically. Only unresolved high-risk decisions appear here."}
      </p>
    </div>
  );
}

export function LoadingLedger() {
  return (
    <div className="border-y border-border py-20 text-center text-sm text-muted-foreground">
      <Clock3 className="mx-auto mb-3 size-5 animate-pulse" aria-hidden="true" />
      Reading the approval ledger…
    </div>
  );
}

export function AdminAccessError({ message }: { message: string }) {
  return (
    <div className="border-y border-destructive/20 bg-destructive/5 px-6 py-16 text-center">
      <CircleAlert className="mx-auto size-7 text-destructive" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-semibold">Administrator access required</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{message}</p>
      <div className="mt-5 flex justify-center">
        <SignInButton callbackURL="/admin/approvals" />
      </div>
    </div>
  );
}

export function RelativeTime({ value }: { value: number | null }) {
  if (!value) return <span>—</span>;
  return (
    <time dateTime={new Date(value).toISOString()} title={new Date(value).toLocaleString()}>
      {new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(value)}
    </time>
  );
}
