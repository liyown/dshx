import { defineDocsChapter } from "../types";

const example = `import {
  defineHost,
  definePromptContext,
  definePromptSection,
} from '@becomeopc/dshx/host'

let requestCount = 0

const guidance = definePromptSection({
  name: 'plugin:guidance',
  order: 150,
  text: 'Use the status tool for plugin runtime questions.',
})

const runtime = definePromptContext({
  name: 'plugin:runtime',
  order: 0,
  text: () => 'Requests observed: ' + requestCount,
})

export default defineHost({ prompts: [guidance, runtime] })`;

export const prompt = defineDocsChapter({
  slug: "prompt",
  group: "contributions",
  copy: {
    en: {
      navigation: "Prompt API",
      eyebrow: "07 · API Candidate",
      title: "Prompt contributions",
      intro:
        "Register official Prompt Sections and Contexts without taking ownership of assembly, scope, shadowing, or lifecycle.",
      description:
        "definePromptSection, definePromptContext, dynamic providers, ordering, injects, and official ownership.",
      sections: [
        {
          id: "helpers",
          label: "@becomeopc/dshx/host",
          title: "definePromptSection() and definePromptContext()",
          blocks: [
            { kind: "code", title: "src/host.ts", code: example },
            {
              kind: "api",
              rows: [
                {
                  name: "definePromptSection(section)",
                  type: "PromptSectionContribution<T>",
                  body: "Returns an opaque contribution and preserves the exact official PromptSection identity and literal type internally.",
                },
                {
                  name: "definePromptContext(context)",
                  type: "PromptContextContribution<T>",
                  body: "Returns an opaque contribution for static text or an official dynamic provider.",
                },
                {
                  name: "name",
                  type: "string",
                  body: "Official contribution name used by duplicate and scoped shadow rules.",
                },
                {
                  name: "order",
                  type: "number",
                  body: "Official assembly order. Equal order values preserve Host array registration order.",
                },
                {
                  name: "text",
                  type: "string | provider",
                  body: "Context providers are evaluated by the official assembler each time it assembles a prompt.",
                },
              ],
            },
          ],
        },
        {
          id: "runtime",
          title: "Registration and ownership",
          blocks: [
            {
              kind: "list",
              items: [
                "A non-empty prompts array adds and deduplicates the systemPrompt inject.",
                "Host registers prompts after Commands and before Settings.",
                "DSHX selects the official section() or context() registration and stores no disposer, registry, assembled prompt, or cache.",
                "DSH owns names, order, duplicate checks, completion, Agent-scope shadowing, dynamic evaluation, assembly, and disposal.",
              ],
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "Prompt API",
      eyebrow: "07 · API Candidate",
      title: "Prompt 贡献",
      intro: "注册官方 Prompt Section 和 Context，不接管 assembly、scope、shadow 或生命周期。",
      description:
        "definePromptSection、definePromptContext、动态 provider、排序、inject 与官方所有权。",
      sections: [
        {
          id: "helpers",
          label: "@becomeopc/dshx/host",
          title: "definePromptSection() 与 definePromptContext()",
          blocks: [
            { kind: "code", title: "src/host.ts", code: example },
            {
              kind: "api",
              rows: [
                {
                  name: "definePromptSection(section)",
                  type: "PromptSectionContribution<T>",
                  body: "返回 opaque 贡献，内部保留官方 PromptSection 的精确对象身份和字面量类型。",
                },
                {
                  name: "definePromptContext(context)",
                  type: "PromptContextContribution<T>",
                  body: "为静态文本或官方动态 provider 返回 opaque 贡献。",
                },
                {
                  name: "name",
                  type: "string",
                  body: "参与 duplicate 和作用域 shadow 规则的官方贡献名。",
                },
                {
                  name: "order",
                  type: "number",
                  body: "官方 assembly order；相同 order 值保持 Host 数组注册顺序。",
                },
                {
                  name: "text",
                  type: "string | provider",
                  body: "Context provider 在官方 assembler 每次组装 Prompt 时重新求值。",
                },
              ],
            },
          ],
        },
        {
          id: "runtime",
          title: "注册与所有权",
          blocks: [
            {
              kind: "list",
              items: [
                "prompts 非空时追加并去重 systemPrompt inject。",
                "Host 在 Commands 后、Settings 前注册 Prompt。",
                "DSHX 只选择官方 section() 或 context() 注册，不保存 disposer、registry、assembled prompt 或 cache。",
                "name、order、duplicate、completion、Agent scope shadow、动态求值、assembly 和 dispose 由 DSH 管理。",
              ],
            },
          ],
        },
      ],
    },
  },
});
