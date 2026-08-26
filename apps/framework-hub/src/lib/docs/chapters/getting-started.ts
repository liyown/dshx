import { defineDocsChapter } from "../types";

const projectTree = `my-plugin/
├── src/
│   ├── host.ts       # Node · official Host contributions
│   ├── client.tsx    # Browser · React contributions
│   ├── settings.ts   # Portable shared contract
│   └── api/
│       └── status.ts # Typed Host–Client API contract
├── dshx.config.ts    # Optional project config
└── package.json`;

export const gettingStarted = defineDocsChapter({
  slug: "getting-started",
  group: "start",
  copy: {
    en: {
      navigation: "Getting started",
      eyebrow: "01 · Start",
      title: "Create and run a plugin",
      intro:
        "Generate a complete Host and Client project, then let DSHX coordinate the official DSH build, link, and development loop.",
      description:
        "Install DSHX, create a plugin, understand its files, and run the DSH development loop.",
      sections: [
        {
          id: "create",
          title: "Create a project",
          blocks: [
            {
              kind: "paragraph",
              text: "The initializer pins a matching DSHX release, declares the supported DSH protocol range, installs dependencies, and never overwrites an existing directory.",
            },
            {
              kind: "terminal",
              lines: [
                { text: "pnpm create dshx my-plugin", kind: "cmd" },
                { text: "# or: --template showcase --style tailwind", kind: "dim" },
                { text: "cd my-plugin", kind: "cmd" },
                { text: "pnpm dev", kind: "cmd" },
                { text: "host ready · client watching · DSH opened", kind: "ok" },
              ],
            },
            {
              kind: "note",
              text: "Interactive creation asks for starter/showcase and css-modules/tailwind/none. --yes selects starter + css-modules.",
            },
          ],
        },
        {
          id: "install-existing",
          title: "Add DSHX to an existing package",
          blocks: [
            {
              kind: "paragraph",
              text: "Install DSHX and DSH directly only when the package already exists. Add the adapter-approved provider packages for the contribution seams you actually use.",
            },
            {
              kind: "code",
              title: "terminal",
              code: "pnpm add -D @becomeopc/dshx @deepseek-ai/dsh",
            },
            {
              kind: "note",
              text: "Keep the public DSH range in peerDependencies and pin one concrete DSH version in devDependencies. DSHX versions independently from DSH.",
            },
          ],
        },
        {
          id: "structure",
          title: "Project structure",
          blocks: [
            {
              kind: "paragraph",
              text: "Host and Client execute in different environments but ship as one DSH plugin package. Shared modules contain data-only contracts that both compilers can safely consume.",
            },
            { kind: "code", title: "project", code: projectTree },
          ],
        },
        {
          id: "develop",
          title: "Development loop",
          blocks: [
            {
              kind: "steps",
              items: [
                {
                  title: "Start the session",
                  body: "pnpm dev builds both entries, links the current package, starts watchers, and opens DSH after the initial build succeeds.",
                },
                {
                  title: "Edit the Client",
                  body: "React and Slot changes use DSH native Client HMR, so the interface refreshes without restarting the Host.",
                },
                {
                  title: "Edit the Host",
                  body: "Host changes rebuild the Node entry. Press r in the interactive session when a Host restart is required, or q to close it.",
                },
                {
                  title: "Validate",
                  body: "Run pnpm check for offline config, manifest, dependency, migration, and TypeScript diagnostics. Use pnpm exec dshx check --runtime only when you also need Profile and live DSH readiness.",
                },
              ],
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "开始使用",
      eyebrow: "01 · 开始",
      title: "创建并运行插件",
      intro: "生成完整的 Host 与 Client 项目，让 DSHX 协调官方 DSH 的构建、关联和开发循环。",
      description: "安装 DSHX、创建插件、了解项目文件，并启动 DSH 开发循环。",
      sections: [
        {
          id: "create",
          title: "创建项目",
          blocks: [
            {
              kind: "paragraph",
              text: "初始化器会固定匹配的 DSHX 版本、声明支持的 DSH 协议范围并安装依赖，而且不会覆盖已有目录。",
            },
            {
              kind: "terminal",
              lines: [
                { text: "pnpm create dshx my-plugin", kind: "cmd" },
                { text: "# 或：--template showcase --style tailwind", kind: "dim" },
                { text: "cd my-plugin", kind: "cmd" },
                { text: "pnpm dev", kind: "cmd" },
                { text: "Host 就绪 · Client 监听中 · DSH 已打开", kind: "ok" },
              ],
            },
            {
              kind: "note",
              text: "交互创建会询问 starter/showcase 和 css-modules/tailwind/none；--yes 默认选择 starter + css-modules。",
            },
          ],
        },
        {
          id: "install-existing",
          title: "接入已有包",
          blocks: [
            {
              kind: "paragraph",
              text: "只有目标包已经存在时才直接安装 DSHX 和 DSH；插件使用到哪类贡献，再安装 adapter 认可的对应 Provider 包。",
            },
            {
              kind: "code",
              title: "terminal",
              code: "pnpm add -D @becomeopc/dshx @deepseek-ai/dsh",
            },
            {
              kind: "note",
              text: "在 peerDependencies 声明公开 DSH 范围，在 devDependencies 固定一个具体 DSH 版本。DSHX 与 DSH 独立发版。",
            },
          ],
        },
        {
          id: "structure",
          title: "项目结构",
          blocks: [
            {
              kind: "paragraph",
              text: "Host 与 Client 运行在不同环境，但最终作为一个 DSH 插件包发布。共享模块只保存两个编译器都能安全消费的数据契约。",
            },
            { kind: "code", title: "project", code: projectTree },
          ],
        },
        {
          id: "develop",
          title: "开发循环",
          blocks: [
            {
              kind: "steps",
              items: [
                {
                  title: "启动会话",
                  body: "pnpm dev 构建两个入口、关联当前包、启动 watcher，并在首次构建成功后打开 DSH。",
                },
                {
                  title: "修改 Client",
                  body: "React 与 Slot 修改复用 DSH 原生 Client HMR，无需重启 Host。",
                },
                {
                  title: "修改 Host",
                  body: "Host 修改会重新构建 Node 入口；需要重启时在交互会话中按 r，按 q 关闭。",
                },
                {
                  title: "执行验证",
                  body: "运行 pnpm check 执行离线 config、manifest、dependency、migration 和 TypeScript 诊断。只在还需要 Profile 与真实 DSH readiness 时执行 pnpm exec dshx check --runtime。",
                },
              ],
            },
          ],
        },
      ],
    },
  },
});
