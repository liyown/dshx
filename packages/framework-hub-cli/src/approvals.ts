import { api } from "./api.js";

export async function createApproval(hub: string, input: unknown) {
  const approval = await api<Record<string, unknown>>(
    hub,
    "/api/ops/approvals",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return withResume(hub, approval);
}

export async function showApproval(hub: string, id: string) {
  return withResume(
    hub,
    await api<Record<string, unknown>>(hub, `/api/ops/approvals/${id}`),
  );
}

export async function reviseApproval(hub: string, id: string, input: unknown) {
  return withResume(
    hub,
    await api<Record<string, unknown>>(
      hub,
      `/api/ops/approvals/${id}/revisions`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),
  );
}

export async function waitForApproval(
  hub: string,
  id: string,
  timeoutSeconds = 300,
) {
  const deadline = Date.now() + Math.max(1, timeoutSeconds) * 1_000;
  let last: Record<string, unknown> | null = null;
  while (Date.now() < deadline) {
    last = await showApproval(hub, id);
    const status = String(last["status"] ?? "");
    if (status !== "pending") return last;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return {
    ...(last ?? { id }),
    awaitingApproval: true,
    timedOut: true,
    resumeCommand: `dshx-hub approvals wait --id ${id}`,
  };
}

export async function claimApprovalEffect(
  hub: string,
  id: string,
  runId?: string,
) {
  return api(hub, `/api/ops/approvals/${id}/effects/claim`, {
    method: "POST",
    body: JSON.stringify({ ...(runId ? { runId } : {}) }),
  });
}

export async function submitApprovalEffectResult(
  hub: string,
  id: string,
  input: unknown,
) {
  return api(hub, `/api/ops/approvals/${id}/effects/result`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function withApprovalResume(
  hub: string,
  value: Record<string, unknown>,
) {
  const approval =
    value["approval"] && typeof value["approval"] === "object"
      ? (value["approval"] as Record<string, unknown>)
      : value;
  const normalized =
    value["requiresApproval"] === true && approval["status"] === undefined
      ? { ...approval, status: "pending" }
      : approval;
  return { ...value, approval: withResume(hub, normalized) };
}

function withResume(hub: string, value: Record<string, unknown>) {
  const id = String(value["id"] ?? "");
  return {
    ...value,
    awaitingApproval: String(value["status"] ?? "") === "pending",
    changesRequested: String(value["status"] ?? "") === "changes_requested",
    approvalUrl: id ? `${hub}/admin/approvals/${id}` : null,
    resumeCommand: id ? `dshx-hub approvals wait --id ${id}` : null,
  };
}
