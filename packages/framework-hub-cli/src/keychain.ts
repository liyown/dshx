import { execFileSync, spawnSync } from "node:child_process";

const service = (hub: string) => `dshx-hub:${new URL(hub).origin}`;

export function readToken(hub: string): string | null {
  try {
    if (process.platform === "darwin")
      return execFileSync(
        "security",
        ["find-generic-password", "-a", "default", "-s", service(hub), "-w"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
    if (process.platform === "linux")
      return execFileSync(
        "secret-tool",
        ["lookup", "service", service(hub), "account", "default"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
  } catch {
    return null;
  }
  throw new Error(
    "This platform does not have a supported system keychain backend",
  );
}

export function saveToken(hub: string, token: string): void {
  if (process.platform === "darwin") {
    execFileSync(
      "security",
      [
        "add-generic-password",
        "-U",
        "-a",
        "default",
        "-s",
        service(hub),
        "-w",
        token,
      ],
      { stdio: "ignore" },
    );
    return;
  }
  if (process.platform === "linux") {
    const result = spawnSync(
      "secret-tool",
      [
        "store",
        "--label=DSHX Hub CLI",
        "service",
        service(hub),
        "account",
        "default",
      ],
      { input: token, encoding: "utf8", stdio: ["pipe", "ignore", "inherit"] },
    );
    if (result.status !== 0)
      throw new Error("Unable to save token in Secret Service");
    return;
  }
  throw new Error(
    "This platform does not have a supported system keychain backend",
  );
}

export function deleteToken(hub: string): void {
  if (process.platform === "darwin") {
    spawnSync(
      "security",
      ["delete-generic-password", "-a", "default", "-s", service(hub)],
      { stdio: "ignore" },
    );
    return;
  }
  if (process.platform === "linux") {
    spawnSync(
      "secret-tool",
      ["clear", "service", service(hub), "account", "default"],
      { stdio: "ignore" },
    );
    return;
  }
  throw new Error(
    "This platform does not have a supported system keychain backend",
  );
}
