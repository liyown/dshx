/** Shared by argument validation and machine-readable capability discovery. */
export const commandShapes: Record<
  string,
  { arity: number; options: string[] }
> = {
  capabilities: { arity: 1, options: ["output"] },
  "ops prompt": { arity: 2, options: ["output"] },
  "ops preflight": {
    arity: 2,
    options: ["hub", "output", "expect-cli-version"],
  },
  "ops begin": {
    arity: 2,
    options: ["hub", "output", "expect-cli-version"],
  },
  "ops status": { arity: 2, options: ["hub", "output"] },
  "ops checkpoint": {
    arity: 2,
    options: ["hub", "output", "run-id", "input"],
  },
  "ops finish": {
    arity: 2,
    options: ["hub", "output", "run-id", "outcome"],
  },
  "auth login": { arity: 2, options: ["hub", "output", "scopes"] },
  "auth status": { arity: 2, options: ["hub", "output"] },
  "auth logout": { arity: 2, options: ["hub", "output"] },
  status: { arity: 1, options: ["hub", "output"] },
  "source inspect": { arity: 3, options: ["output"] },
  "source discover": {
    arity: 2,
    options: ["provider", "query", "since", "cursor", "limit", "output"],
  },
  "report latest": { arity: 2, options: ["hub", "output"] },
  "report publish": {
    arity: 2,
    options: ["hub", "input", "output", "run-id"],
  },
  "plugin list": {
    arity: 2,
    options: [
      "hub",
      "output",
      "state",
      "needs",
      "source",
      "risk",
      "observed-before",
      "updated-before",
      "limit",
      "cursor",
      "all",
    ],
  },
  "plugin get": { arity: 3, options: ["hub", "output"] },
  "plugin upsert": {
    arity: 2,
    options: ["hub", "input", "output", "dry-run", "run-id"],
  },
  "plugin curate": {
    arity: 3,
    options: ["hub", "input", "output", "if-revision", "run-id"],
  },
  "plugin hide": { arity: 3, options: ["hub", "output", "reason", "run-id"] },
  "plugin restore": {
    arity: 3,
    options: ["hub", "output", "reason", "run-id"],
  },
  "submission list": {
    arity: 2,
    options: ["hub", "output", "status", "limit", "cursor", "all"],
  },
  "submission get": { arity: 3, options: ["hub", "output"] },
  "submission resolve": {
    arity: 3,
    options: ["hub", "output", "result", "plugin", "reason", "run-id"],
  },
  "media upload": {
    arity: 3,
    options: ["hub", "input", "output", "run-id"],
  },
  audit: { arity: 1, options: ["hub", "output", "scope"] },
};
