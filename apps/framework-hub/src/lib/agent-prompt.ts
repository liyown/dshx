import type { Locale } from "@/lib/i18n";

export const DSHX_DEVELOPMENT_SKILL = "dshx-plugin-development";
export const DSHX_DEVELOPMENT_SKILL_INSTALL =
  "npx skills add liyown/SKILL --skill dshx-plugin-development";
export const DSHX_DEVELOPMENT_SKILL_URL =
  "https://github.com/liyown/SKILL/blob/main/skills/dshx-plugin-development/SKILL.md";

const prompts: Readonly<Record<Locale, string>> = {
  en: `I want you to build or modify a DeepSeek Harness plugin with DSHX in this workspace. Do not guess the API or start coding before the development guide is loaded.

1. Check whether the \`${DSHX_DEVELOPMENT_SKILL}\` skill is installed. If it is missing, run:
   \`${DSHX_DEVELOPMENT_SKILL_INSTALL}\`
2. Load and follow \`$${DSHX_DEVELOPMENT_SKILL}\`, including its development workflow and the API map relevant to this request. If this agent cannot load a newly installed skill in the current session, read ${DSHX_DEVELOPMENT_SKILL_URL} directly and follow its referenced files.
3. Inspect the current repository, package manifest, DSHX config, Host and Client entries, installed DSH version, compatibility diagnostics, and existing tests before choosing a design.
4. Use pnpm, preserve unrelated work, keep DSHX runtime-thin, and use the installed official DSH contracts as the source of truth.
5. Read only the relevant current API chapter under https://dshx.io/en/docs, implement the requested behavior, and run the guide's proportional checks. Clearly distinguish type/unit/build checks from real DSH runtime verification.

If I have not provided the concrete plugin behavior yet, ask me one concise question after completing the setup checks. Do not publish, push, or deploy unless I explicitly ask.`,
  zh: `我要你在当前工作区使用 DSHX 开发或修改一个 DeepSeek Harness 插件。不要猜测 API，也不要在加载开发指引前开始写代码。

1. 检查是否已经安装 \`${DSHX_DEVELOPMENT_SKILL}\` Skill；如果没有，运行：
   \`${DSHX_DEVELOPMENT_SKILL_INSTALL}\`
2. 加载并遵循 \`$${DSHX_DEVELOPMENT_SKILL}\`，包括其中的开发流程和与本需求相关的 API map。如果当前 Agent 无法在本次会话加载刚安装的 Skill，直接读取 ${DSHX_DEVELOPMENT_SKILL_URL} 及其引用文件并继续。
3. 选择设计前，检查当前仓库、package manifest、DSHX config、Host/Client 入口、已安装 DSH 版本、兼容性诊断和现有测试。
4. 使用 pnpm，保留无关改动，保持 DSHX runtime-thin，并以已安装的官方 DSH contract 为事实来源。
5. 只读取 https://dshx.io/zh/docs 下与任务相关的最新 API 章节，实现需求并执行开发指引要求的相应验证；明确区分类型、单元、构建验证与真实 DSH Runtime 验证。

如果我还没有说明具体插件需求，完成上述准备检查后只问我一个简短问题。除非我明确要求，不要发布、push 或部署。`,
};

export function getDshxDeveloperPrompt(locale: Locale): string {
  return prompts[locale];
}
