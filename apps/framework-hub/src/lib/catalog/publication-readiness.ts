import { assessPrimaryTargets, type InstallTargetInput } from "./install-target/policy";
import { jsonRecord, type JsonRecord } from "./json";

type SourceSummaryLike = {
  kind: string;
  availability: "available" | "unavailable";
};

type CurationLike = {
  categories: string[];
  derivedFrom: string[];
  sourceReadmeHash?: string | undefined;
} | null;

function installTargetInput(target: JsonRecord): InstallTargetInput | null {
  if (typeof target["kind"] !== "string" || typeof target["spec"] !== "string") return null;
  return {
    kind: target["kind"],
    spec: target["spec"],
    packageName: typeof target["packageName"] === "string" ? target["packageName"] : null,
    version: typeof target["version"] === "string" ? target["version"] : null,
    packagePath: typeof target["packagePath"] === "string" ? target["packagePath"] : null,
    primary: target["primary"] === true,
    available: target["available"] !== false,
  };
}

/**
 * Facts that must be present before a plugin may leave draft. The install
 * target branch delegates to the policy module so this gate cannot drift from
 * the command the public page renders.
 */
export function publicationRequirements(
  facts: JsonRecord,
  sources: readonly SourceSummaryLike[],
  curation: CurationLike,
): string[] {
  const missing: string[] = [];
  const packageFacts = jsonRecord(facts["package"]);
  if (typeof packageFacts["name"] !== "string" || !packageFacts["name"].trim())
    missing.push("name");
  if (typeof packageFacts["version"] !== "string" || !packageFacts["version"].trim())
    missing.push("version");
  if (!sources.some((source) => source.availability === "available")) missing.push("source");
  const publicSourceObserved = sources.some(
    (source) => source.kind === "github" || source.kind === "npm",
  );
  const readme = jsonRecord(facts["readme"]);
  if (
    publicSourceObserved &&
    !["available", "unavailable"].includes(String(readme["availability"]))
  )
    missing.push("readme");
  const repository = jsonRecord(facts["repository"]);
  const publisher = jsonRecord(facts["publisher"]);
  if (
    typeof repository["fullName"] === "string" &&
    (typeof publisher["githubId"] !== "string" ||
      typeof publisher["avatarUrl"] !== "string" ||
      typeof publisher["profileUrl"] !== "string")
  )
    missing.push("publisher");

  const rawTargets = Array.isArray(facts["installTargets"])
    ? (facts["installTargets"] as JsonRecord[])
    : [];
  const targets = rawTargets
    .map(installTargetInput)
    .filter((target): target is InstallTargetInput => target !== null);
  // Only the primary target gates publication; a malformed alternative target
  // must not turn a ready plugin into a draft.
  const availablePrimaries = rawTargets.filter(
    (target) => target["primary"] === true && target["available"] !== false,
  ).length;
  const parsedPrimaries = targets.filter(
    (target) => target.primary === true && target.available !== false,
  ).length;
  const verdict =
    availablePrimaries === parsedPrimaries
      ? assessPrimaryTargets(targets, {
          packageName: typeof packageFacts["name"] === "string" ? packageFacts["name"] : "",
          version: typeof packageFacts["version"] === "string" ? packageFacts["version"] : "",
          repositoryFullName:
            typeof repository["fullName"] === "string" ? repository["fullName"] : null,
        })
      : null;
  if (!verdict?.ok) {
    const listLevel =
      verdict?.reason === "missing-primary" || verdict?.reason === "ambiguous-primary";
    missing.push(listLevel ? "primaryInstallTarget" : "safePrimaryInstallTarget");
  }

  if (!curation) missing.push("content");
  else {
    if (!curation.categories.length) missing.push("category");
    if (!curation.derivedFrom.length) missing.push("sourceCitation");
    if (
      readme["availability"] === "available" &&
      typeof readme["contentHash"] === "string" &&
      curation.sourceReadmeHash !== readme["contentHash"]
    )
      missing.push("readmeCuration");
  }
  return missing;
}
