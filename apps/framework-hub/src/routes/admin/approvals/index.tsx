import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

import {
  AdminAccessError,
  AdminHeader,
  ApprovalEmpty,
  type ApprovalListItem,
  LoadingLedger,
  RelativeTime,
  RiskBadge,
  StatusBadge,
} from "@/components/admin/approval-ui";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasAdminAccess } from "@/lib/auth/functions";

const searchSchema = z.object({
  status: z.string().optional(),
  kind: z.string().optional(),
  risk: z.string().optional(),
});

type ApprovalPage = {
  items: ApprovalListItem[];
  counts: Array<{ status: string; count: number }>;
};

const directionContract = `<!--
THESIS: A quiet evidence ledger where irreversible decisions feel deliberate, never casual.
OWN-WORLD: DSHX editorial typography, warm paper surfaces, technical mono metadata, one violet accent.
STORY: queue health -> risk and effect -> immutable evidence -> explicit decision -> execution audit.
FIRST VIEWPORT: queue title, pending summary, restrained filters, and the oldest critical decisions.
FORM: flat ledger rows and bordered evidence sections; no dashboard card wall and no decorative panels.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
SEED: approval-ledger
-->`;

export const Route = createFileRoute("/admin/approvals/")({
  validateSearch: searchSchema,
  loader: async () => {
    if (!(await hasAdminAccess()))
      throw redirect({ to: "/$locale/account", params: { locale: "en" } });
  },
  head: () => ({
    meta: [{ title: "Approvals · DSHX Hub" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: ApprovalQueuePage,
});

function ApprovalQueuePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/approvals/" });
  const [data, setData] = useState<ApprovalPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (search.status) params.set("status", search.status);
    if (search.kind) params.set("kind", search.kind);
    if (search.risk) params.set("risk", search.risk);
    const response = await fetch(`/api/admin/approvals?${params.toString()}`);
    const payload = (await response.json()) as ApprovalPage & { error?: { message?: string } };
    if (!response.ok) {
      setError(payload.error?.message ?? "The approval ledger could not be loaded.");
      setData(null);
      return;
    }
    setData(payload);
  }, [search.kind, search.risk, search.status]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = data?.counts.find((entry) => entry.status === "pending")?.count ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <div dangerouslySetInnerHTML={{ __html: directionContract }} />
      <AdminHeader />
      <main className="mx-auto max-w-[1440px] px-5 py-12 lg:px-8">
        <div className="flex flex-col justify-between gap-6 border-b border-border pb-8 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">
              Human decision boundary
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.035em]">Approval queue</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Only high-risk operations that cannot be completed deterministically arrive here.
              Every action is checked against its original evidence before execution.
            </p>
          </div>
          <div className="shrink-0 text-left md:text-right">
            <div className="font-mono text-4xl tracking-[-0.04em]">{pending}</div>
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              pending review
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-border py-5 md:flex-row md:items-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Filter ledger
          </div>
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3 md:max-w-3xl">
            <FilterSelect
              value={search.status}
              placeholder="All statuses"
              options={[
                "pending",
                "changes_requested",
                "approved",
                "rejected",
                "expired",
                "superseded",
              ]}
              onChange={(status) => navigate({ search: (old) => ({ ...old, status }) })}
            />
            <FilterSelect
              value={search.risk}
              placeholder="All risks"
              options={["critical", "high"]}
              onChange={(risk) => navigate({ search: (old) => ({ ...old, risk }) })}
            />
            <FilterSelect
              value={search.kind}
              placeholder="All types"
              options={[
                "user_role_change",
                "content_restore",
                "user_access_change",
                "maintainer_override",
                "plugin_security",
                "catalog_identity_override",
                "ops_exception",
              ]}
              onChange={(kind) => navigate({ search: (old) => ({ ...old, kind }) })}
            />
          </div>
          {search.status || search.kind || search.risk ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ search: {} })}
              className="md:ml-auto"
            >
              Clear filters
            </Button>
          ) : null}
        </div>

        <section aria-live="polite">
          {error ? <AdminAccessError message={error} /> : null}
          {!error && !data ? <LoadingLedger /> : null}
          {data && data.items.length === 0 ? (
            <ApprovalEmpty filtered={Boolean(search.status || search.kind || search.risk)} />
          ) : null}
          {data && data.items.length > 0 ? <ApprovalTable items={data.items} /> : null}
        </section>
      </main>
    </div>
  );
}

function FilterSelect({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string | undefined;
  placeholder: string;
  options: string[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Select
      value={value ?? "all"}
      onValueChange={(next) => onChange(next === "all" ? undefined : next)}
    >
      <SelectTrigger aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option.replaceAll("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ApprovalTable({ items }: { items: ApprovalListItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[42%]">Request</TableHead>
          <TableHead>Risk</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Effect</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id} className="group">
            <TableCell>
              <Link to="/admin/approvals/$id" params={{ id: item.id }} className="block py-2">
                <div className="font-medium group-hover:text-accent">{item.title}</div>
                <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {item.summary}
                </div>
                <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                  {item.kind.replaceAll("_", " ")} · {item.subject_type}:{item.subject_id}
                </div>
              </Link>
            </TableCell>
            <TableCell>
              <RiskBadge risk={item.risk} />
            </TableCell>
            <TableCell>
              <StatusBadge status={item.status} />
            </TableCell>
            <TableCell>
              <div className="font-mono text-xs">{item.effect_kind.replaceAll("_", " ")}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.effect_status}</div>
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
              <RelativeTime value={item.expires_at} />
            </TableCell>
            <TableCell>
              <Button asChild variant="ghost" size="icon" aria-label={`Review ${item.title}`}>
                <Link to="/admin/approvals/$id" params={{ id: item.id }}>
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
