import type { DailyDiscoveryQuery } from "../contracts.js";

/** Optional starting points; the Agent chooses queries, sources, and windows. */
export const dailyDiscoveryQueries = [
  {
    id: "github-dsh-bundle-patch",
    provider: "github",
    query: '"dsh.bundle.patch"',
    signal: "dsh.bundle.patch",
    rationale:
      "Find repositories that mention the canonical DeepSeek Harness plugin bundle patch.",
  },
  {
    id: "github-cordis-patch",
    provider: "github",
    query: '"cordis.patch.yml"',
    signal: "cordis.patch.yml",
    rationale:
      "Find repositories that carry the legacy or compatibility patch filename.",
  },
  {
    id: "github-dsh-plugin-keywords",
    provider: "github",
    query: '"DSH" plugin',
    signal: "dsh-plugin-keywords",
    rationale:
      "Find repository names, descriptions, topics, and README metadata that use the DSH shorthand for DeepSeek Harness plugins.",
  },
  {
    id: "github-deepseek-harness-plugin-keywords",
    provider: "github",
    query: '"deepseek-harness" plugin',
    signal: "deepseek-harness-plugin-keywords",
    rationale:
      "Find repository metadata that describes a DeepSeek Harness plugin.",
  },
  {
    id: "github-deepseek-harness-phrase",
    provider: "github",
    query: '"DeepSeek Harness" plugin',
    signal: "deepseek-harness-plugin-keywords",
    rationale:
      "Find repository metadata that spells out the full DeepSeek Harness product name.",
  },
  {
    id: "npm-dsh-bundle-patch",
    provider: "npm",
    query: '"dsh.bundle.patch"',
    signal: "dsh.bundle.patch",
    rationale:
      "Find package names, descriptions, and keywords that reference the canonical bundle patch.",
  },
  {
    id: "npm-cordis-patch",
    provider: "npm",
    query: '"cordis.patch.yml"',
    signal: "cordis.patch.yml",
    rationale:
      "Find package metadata that references the compatibility patch filename.",
  },
  {
    id: "npm-dsh-plugin-keywords",
    provider: "npm",
    query: "DSH plugin",
    signal: "dsh-plugin-keywords",
    rationale:
      "Find npm package names, descriptions, and keywords that use the DSH shorthand for DeepSeek Harness plugins.",
  },
  {
    id: "npm-deepseek-harness-plugin-keywords",
    provider: "npm",
    query: "deepseek-harness plugin",
    signal: "deepseek-harness-plugin-keywords",
    rationale: "Find npm package metadata describing DeepSeek Harness plugins.",
  },
  {
    id: "npm-deepseek-harness-phrase",
    provider: "npm",
    query: '"DeepSeek Harness" plugin',
    signal: "deepseek-harness-plugin-keywords",
    rationale:
      "Find npm package metadata that spells out the full DeepSeek Harness product name.",
  },
] as const satisfies readonly DailyDiscoveryQuery[];
