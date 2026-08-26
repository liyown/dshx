import { defineDocsChapter } from "../types";

const commands = `# Interactive: asks for template and style
pnpm create dshx my-plugin

# Explicit combinations
pnpm create dshx my-plugin --template starter --style css-modules
pnpm create dshx my-plugin --template showcase --style tailwind
pnpm create dshx my-plugin --template starter --style none

# Non-interactive defaults: starter + css-modules
pnpm create dshx my-plugin --yes`;

const programmatic = `import { createProject } from 'create-dshx'

const result = await createProject({
  name: 'my-plugin',
  template: 'showcase',
  style: 'tailwind',
  packageManager: 'pnpm',
  install: true,
})`;

export const creator = defineDocsChapter({
  slug: "creator",
  group: "start",
  copy: {
    en: {
      navigation: "Creator",
      eyebrow: "03 · Project generator",
      title: "Creator templates and styles",
      intro:
        "Choose the feature set and styling pipeline independently. The generator writes only the provider edges and dependencies used by that combination.",
      description:
        "CLI selectors, Starter and Showcase contents, CSS Modules, Tailwind, no-style output, and programmatic creation.",
      sections: [
        {
          id: "selectors",
          label: "create-dshx",
          title: "--template and --style",
          blocks: [
            { kind: "code", title: "Terminal", code: commands },
            {
              kind: "api",
              rows: [
                {
                  name: "--template starter",
                  type: "minimal",
                  body: "One Host Tool, one visible Client Slot, and the minimum manifest/package/config files.",
                },
                {
                  name: "--template showcase",
                  type: "feature example",
                  body: "Status Tool, Prompt Section and dynamic Context, Settings contract, typed API, and Runtime Deck Slot. It excludes Experimental Conversation.",
                },
                {
                  name: "--style css-modules",
                  type: "default",
                  body: "Scoped CSS through Vite's standard CSS Modules pipeline.",
                },
                {
                  name: "--style tailwind",
                  type: "Tailwind v4",
                  body: "Adds tailwindcss and @tailwindcss/vite as project dev dependencies, with dshx: utilities and no Preflight.",
                },
                {
                  name: "--style none",
                  type: "no CSS",
                  body: "Writes no stylesheet or styling dependency.",
                },
                {
                  name: "--yes",
                  type: "starter + css-modules",
                  body: "Accepts non-interactive defaults. Explicit selectors still take precedence.",
                },
              ],
            },
          ],
        },
        {
          id: "generated-project",
          title: "Generated scripts and dependencies",
          blocks: [
            {
              kind: "list",
              items: [
                "check runs the offline project and TypeScript checks.",
                "build runs type checking and emits Host, Client, sourcemaps, and declarations.",
                "dev opens the DSH build-watch loop.",
                "prepack runs check and build before packaging.",
                "The six template/style combinations contain no workspace:* specifiers and declare only the selected official provider edges.",
              ],
            },
          ],
        },
        {
          id: "programmatic",
          title: "createProject(options)",
          blocks: [
            { kind: "code", title: "Programmatic creator", code: programmatic },
            {
              kind: "api",
              rows: [
                { name: "name", type: "string", body: "Target directory and package identity." },
                {
                  name: "template",
                  type: "starter | showcase",
                  body: "Same feature selector as the CLI.",
                },
                {
                  name: "style",
                  type: "css-modules | tailwind | none",
                  body: "Same styling selector as the CLI.",
                },
                {
                  name: "packageManager",
                  type: "pnpm | yarn | npm",
                  body: "Installer used when install is true.",
                },
                {
                  name: "return",
                  type: "CreateProjectResult",
                  body: "Resolved root, package id, selected template/style, files, installer, and diagnostics.",
                },
              ],
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "Creator",
      eyebrow: "03 · 项目生成器",
      title: "Creator 模板与样式",
      intro: "分别选择功能集和样式管线；生成器只写入该组合实际使用的 Provider edge 和依赖。",
      description:
        "CLI 选择器、Starter/Showcase 内容、CSS Modules、Tailwind、无样式输出与程序化创建。",
      sections: [
        {
          id: "selectors",
          label: "create-dshx",
          title: "--template 与 --style",
          blocks: [
            { kind: "code", title: "Terminal", code: commands },
            {
              kind: "api",
              rows: [
                {
                  name: "--template starter",
                  type: "最小项目",
                  body: "一个 Host Tool、一个可见 Client Slot，以及最小 manifest/package/config 文件。",
                },
                {
                  name: "--template showcase",
                  type: "功能示例",
                  body: "Status Tool、Prompt Section/动态 Context、Settings contract、typed API 和 Runtime Deck Slot；不包含 Experimental Conversation。",
                },
                {
                  name: "--style css-modules",
                  type: "默认",
                  body: "通过 Vite 标准 CSS Modules 管线输出 scoped CSS。",
                },
                {
                  name: "--style tailwind",
                  type: "Tailwind v4",
                  body: "把 tailwindcss 和 @tailwindcss/vite 加为项目 dev dependency，使用 dshx: utility 且不加载 Preflight。",
                },
                { name: "--style none", type: "无 CSS", body: "不写入样式表或样式依赖。" },
                {
                  name: "--yes",
                  type: "starter + css-modules",
                  body: "接受非交互默认值；显式 selector 仍优先。",
                },
              ],
            },
          ],
        },
        {
          id: "generated-project",
          title: "生成脚本与依赖",
          blocks: [
            {
              kind: "list",
              items: [
                "check 运行离线项目检查和 TypeScript 检查。",
                "build 先检查类型，再输出 Host、Client、sourcemap 和 declaration。",
                "dev 启动 DSH build-watch 循环。",
                "prepack 在打包前运行 check 和 build。",
                "六种 template/style 组合都不含 workspace:* specifier，且只声明选中的官方 Provider edge。",
              ],
            },
          ],
        },
        {
          id: "programmatic",
          title: "createProject(options)",
          blocks: [
            { kind: "code", title: "程序化 Creator", code: programmatic },
            {
              kind: "api",
              rows: [
                { name: "name", type: "string", body: "目标目录与 package identity。" },
                {
                  name: "template",
                  type: "starter | showcase",
                  body: "与 CLI 相同的功能 selector。",
                },
                {
                  name: "style",
                  type: "css-modules | tailwind | none",
                  body: "与 CLI 相同的样式 selector。",
                },
                {
                  name: "packageManager",
                  type: "pnpm | yarn | npm",
                  body: "install 为 true 时使用的安装器。",
                },
                {
                  name: "return",
                  type: "CreateProjectResult",
                  body: "已解析 root、package id、template/style、文件、安装器与诊断。",
                },
              ],
            },
          ],
        },
      ],
    },
  },
});
