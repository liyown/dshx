import { defineDocsChapter } from "../types";

export const architecture = defineDocsChapter({
  slug: "architecture",
  group: "start",
  lastVerified: "2026-08-28",
  references: [
    {
      label: "DSHX architecture",
      url: "https://github.com/liyown/dshx/blob/main/docs/architecture.md",
    },
    { label: "DeepSeek Harness", url: "https://github.com/deepseek-ai/DeepSeek-Harness" },
  ],
  copy: {
    en: {
      navigation: "Architecture",
      eyebrow: "System boundaries",
      title: "DSHX architecture",
      intro:
        "DSHX is a build-time toolchain for out-of-tree DeepSeek Harness plugins. It prepares typed Host and Client modules; official DSH and Cordis services continue to own execution and lifecycle.",
      description:
        "Understand the boundary between DSHX, DeepSeek Harness, Cordis, plugin Host modules, Client modules, and the DSHX Hub.",
      sections: [
        {
          id: "ownership",
          label: "01 / ownership",
          title: "Who owns each responsibility?",
          blocks: [
            {
              kind: "list",
              items: [
                "DSHX owns authoring helpers, validation, bounded Vite compilation, diagnostics, templates, and the development workflow.",
                "DeepSeek Harness and Cordis own runtime execution, registries, scopes, transport, persistence, assembly, HMR cleanup, and disposal.",
                "A plugin Host contributes tools, commands, settings, prompts, and API handlers; its Client contributes React UI, locales, Slots, and typed API consumers.",
                "DSHX Hub catalogs public plugin facts and provenance. It does not execute third-party plugin code or replace the runtime.",
              ],
            },
          ],
        },
        {
          id: "flow",
          label: "02 / flow",
          title: "Build and development flow",
          blocks: [
            {
              kind: "terminal",
              title: "terminal",
              lines: [
                { text: "pnpm create dshx my-plugin", kind: "cmd" },
                { text: "cd my-plugin && pnpm dshx check", kind: "cmd" },
              ],
            },
            {
              kind: "steps",
              items: [
                {
                  title: "Author",
                  body: "Write typed Host, Client, Settings, and shared API modules.",
                },
                {
                  title: "Check",
                  body: "Validate configuration, manifest metadata, compatibility, and TypeScript without changing source.",
                },
                {
                  title: "Build",
                  body: "Compile bounded Host and Client artifacts through Vite while retaining official loader contracts.",
                },
                {
                  title: "Run",
                  body: "Let the linked DSH Profile and Composition load and own the resulting plugin lifecycle.",
                },
              ],
            },
          ],
        },
        {
          id: "limits",
          label: "03 / limits",
          title: "Explicit limits",
          blocks: [
            {
              kind: "note",
              text: "Verified for @becomeopc/dshx 0.1.4-preview.0 and protocol-1 DSH boundaries 0.1.0-rc.8 and 0.1.1-rc.2. DSHX does not provide a parallel Agent, Session, Tool, Slot, transport, persistence, or HMR runtime. Experimental surfaces remain labeled and do not imply a 1.0 stability guarantee.",
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "架构边界",
      eyebrow: "系统边界",
      title: "DSHX 架构",
      intro:
        "DSHX 是面向 DeepSeek Harness 外部插件的构建期工具链。它生成类型化 Host 与 Client 模块；实际执行和生命周期仍由官方 DSH 与 Cordis 服务负责。",
      description:
        "了解 DSHX、DeepSeek Harness、Cordis、插件 Host、Client 与 DSHX Hub 的职责边界。",
      sections: [
        {
          id: "ownership",
          label: "01 / ownership",
          title: "各层分别负责什么？",
          blocks: [
            {
              kind: "list",
              items: [
                "DSHX 负责开发辅助、校验、受约束的 Vite 编译、诊断、模板与开发流程。",
                "DeepSeek Harness 与 Cordis 负责 Runtime 执行、Registry、Scope、Transport、持久化、装配、HMR 清理和 Dispose。",
                "插件 Host 贡献 Tool、Command、Settings、Prompt 与 API Handler；Client 贡献 React UI、Locale、Slot 与类型化 API Consumer。",
                "DSHX Hub 记录公开插件事实与来源，不执行第三方插件代码，也不替代 Runtime。",
              ],
            },
          ],
        },
        {
          id: "flow",
          label: "02 / flow",
          title: "构建与开发流程",
          blocks: [
            {
              kind: "terminal",
              title: "terminal",
              lines: [
                { text: "pnpm create dshx my-plugin", kind: "cmd" },
                { text: "cd my-plugin && pnpm dshx check", kind: "cmd" },
              ],
            },
            {
              kind: "steps",
              items: [
                { title: "开发", body: "编写类型化 Host、Client、Settings 和共享 API 模块。" },
                { title: "检查", body: "只读校验配置、Manifest、兼容性与 TypeScript。" },
                {
                  title: "构建",
                  body: "通过受约束的 Vite 管线生成 Host 与 Client 产物，并保留官方 Loader 契约。",
                },
                {
                  title: "运行",
                  body: "由关联的 DSH Profile 与 Composition 加载并管理插件生命周期。",
                },
              ],
            },
          ],
        },
        {
          id: "limits",
          label: "03 / limits",
          title: "明确限制",
          blocks: [
            {
              kind: "note",
              text: "本文已按 @becomeopc/dshx 0.1.4-preview.0，以及 protocol-1 的 DSH 0.1.0-rc.8 与 0.1.1-rc.2 边界验证。DSHX 不提供平行的 Agent、Session、Tool、Slot、Transport、持久化或 HMR Runtime。实验性能力会明确标注，也不代表 1.0 稳定性承诺。",
            },
          ],
        },
      ],
    },
  },
});
