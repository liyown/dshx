# Creator API

**Status: API Candidate**

**Package: `create-dshx`**

## CLI

```bash
pnpm create dshx@preview my-plugin --template starter --style css-modules
pnpm create dshx@preview my-plugin --template showcase --style tailwind
pnpm create dshx@preview my-plugin --template starter --style none
```

```text
--template starter|showcase
--style css-modules|tailwind|none
--yes
--install | --no-install
--package-manager pnpm|yarn|npm
--cwd <parent-directory>
```

Interactive mode asks for project name, template, style, and dependency installation. Installation keeps an animated status line visible until it succeeds or fails. The creator follows the package manager that invoked it, while `--package-manager` remains an explicit override. `--yes` uses `starter + css-modules` unless selectors are passed. The target directory must not already exist.

## Template matrix

Template and style are independent, producing six supported combinations.

| Template   | Generated capabilities                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| `starter`  | One Host Tool, one typed `defineLocale()` contribution, one visible Client Slot, and project files   |
| `showcase` | Status Tool, Prompt Section, dynamic Prompt Context, Settings contract, typed API, Runtime Deck Slot |

`showcase` intentionally excludes the experimental Conversation API.

| Style         | Generated build setup                                                       |
| ------------- | --------------------------------------------------------------------------- |
| `css-modules` | `Plugin.module.css`, declaration shim, standard Vite CSS Modules import     |
| `tailwind`    | Tailwind v4 and `@tailwindcss/vite`, CSS-first `dshx:` prefix, no Preflight |
| `none`        | No stylesheet or style dependency                                           |

The typed template registry writes only providers, `dsh.client.inject` edges, peers, and dev dependencies used by the selected combination. Generated versions contain no `workspace:*` specifiers.

## Generated scripts

Every generated package contains:

```json
{
  "scripts": {
    "check": "dshx check",
    "build": "dshx build",
    "dev": "dshx dev --open",
    "prepack": "npm run check && npm run build"
  }
}
```

`check` is offline; use `pnpm exec dshx check --runtime` only when the project is linked to a running Profile and runtime readiness is part of the check.

The starter owns its copy with `defineLocale(namespace, { zh, en })`, passes the returned definition to both `defineClient({ locales })` and `defineSlot({ locale })`, and derives the component prop from `PropsLocaleOf<typeof copy>`. No `LocaleNamespaceMap` declaration merging is required. The generated manifest includes `@deepseek-ai/dsh-client-locale` in `dsh.client.inject`, peers, and development dependencies because the official Locale provider remains a runtime package edge.

## Programmatic API

```ts
import { createProject } from "create-dshx";

const result = await createProject({
  name: "my-plugin",
  template: "showcase",
  style: "tailwind",
  packageManager: "pnpm",
  install: true,
});
```

```ts
interface CreateProjectOptions {
  readonly name: string;
  readonly template?: "starter" | "showcase";
  readonly style?: "css-modules" | "tailwind" | "none";
  readonly cwd?: string;
  readonly install?: boolean;
  readonly packageManager?: "pnpm" | "yarn" | "npm";
  readonly onInstallProgress?: (event: {
    readonly phase: "start" | "success" | "failure";
    readonly packageManager: "pnpm" | "yarn" | "npm";
  }) => void;
  readonly dshxVersion?: string;
  readonly dshVersion?: string;
  readonly dshRange?: string;
}
```

The result reports `root`, `packageId`, selected `template` and `style`, written `files`, selected package manager, installation status, and structured diagnostics. Defaults are exported as `DEFAULT_TEMPLATE`, `DEFAULT_STYLE`, `DEFAULT_DSH_VERSION`, and `DEFAULT_DSH_RANGE`.

Generation is compositional but not a public plugin system: DSHX does not expose a generic template registry or `dshx add api/settings/prompt/conversation` commands.
