export type PublicInstallTarget = {
  kind: string;
  spec: string;
  package_name: string;
  version: string;
  status: string;
  is_primary: number;
};

function parseGithubRepository(value: string | null): string | null {
  if (!value) return null;
  try {
    const repository = new URL(value);
    const segments = repository.pathname
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);
    if (
      repository.protocol !== "https:" ||
      repository.hostname !== "github.com" ||
      segments.length !== 2
    )
      return null;
    return `${segments[0]}/${segments[1]}`;
  } catch {
    return null;
  }
}

function isSafeGitRef(value: string): boolean {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)) return false;
  if (value === "@" || value.includes("..") || value.includes("//") || value.includes("@{"))
    return false;
  if (value.endsWith("/") || value.endsWith(".")) return false;
  return value.split("/").every((part) => !part.startsWith(".") && !part.endsWith(".lock"));
}

/** Select the one server-approved install target without duplicating source verification policy. */
export function selectInstallTarget(
  targets: PublicInstallTarget[],
  packageName: string,
  version: string,
  repositoryUrl: string | null,
): PublicInstallTarget | null {
  const candidates = targets.filter(
    (target) =>
      target.is_primary === 1 &&
      target.status === "active" &&
      target.package_name === packageName &&
      target.version === version,
  );
  if (candidates.length !== 1) return null;

  const target = candidates[0]!;
  if (target.spec !== target.spec.trim() || /[\0\r\n\s]/.test(target.spec)) return null;
  if (target.kind === "npm") return target.spec === `${packageName}@${version}` ? target : null;
  if (target.kind !== "github") return null;

  const fullName = parseGithubRepository(repositoryUrl);
  if (!fullName) return null;
  const prefix = `github:${fullName}#`;
  if (!target.spec.startsWith(prefix)) return null;
  return isSafeGitRef(target.spec.slice(prefix.length)) ? target : null;
}
