import { assessPrimaryTargets, assessTargetSpec, normalizeGithubFullName } from "./policy";

export type PublicInstallTarget = {
  kind: string;
  spec: string;
  package_name: string;
  version: string;
  status: string;
  is_primary: number;
};

export const DEFAULT_DSH_PROFILE = "web";

export function buildPluginInstallCommand(
  spec: string,
  profile: string = DEFAULT_DSH_PROFILE,
): string {
  return `dsh plugin --profile ${profile} add ${spec}`;
}

/**
 * Select the one server-approved install target for the public page. The
 * decision itself lives in `policy.ts`; this only translates a public row into
 * that shape and returns the row the page should render.
 */
export function selectInstallTarget(
  targets: PublicInstallTarget[],
  packageName: string,
  version: string,
  repositoryUrl: string | null,
): PublicInstallTarget | null {
  const verdict = assessPrimaryTargets(
    targets.map((target) => ({
      kind: target.kind,
      spec: target.spec,
      packageName: target.package_name,
      version: target.version,
      primary: target.is_primary === 1,
      available: target.status === "active",
    })),
    {
      packageName,
      version,
      repositoryFullName: normalizeGithubFullName(repositoryUrl),
    },
  );
  if (!verdict.ok) return null;
  return targets[verdict.index] ?? null;
}

/**
 * The targets a page may list as commands. Unlike `selectInstallTarget` this
 * accepts more than one row, so it applies the per-target rule only: an
 * inactive or unsafe target must never reach a copyable command, even when
 * another target made the plugin installable.
 */
export function selectPublicInstallTargets(
  targets: PublicInstallTarget[],
  packageName: string,
  repositoryUrl: string | null,
): PublicInstallTarget[] {
  const expectation = {
    packageName,
    repositoryFullName: normalizeGithubFullName(repositoryUrl),
  };
  return targets.filter(
    (target) =>
      target.status === "active" &&
      assessTargetSpec(
        {
          kind: target.kind,
          spec: target.spec,
          packageName: target.package_name,
          version: target.version,
        },
        expectation,
      ).ok,
  );
}
