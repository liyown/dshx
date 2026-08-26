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
3. Read the relevant current API chapters under https://dshx.io/en/docs. Treat Host, Client, defineLocale, API, Settings, Prompt and Slot as API Candidate; treat Conversation, Vite compatibility and programmatic Tooling as Experimental. Use defineLocale for plugin-owned zh/en copy instead of asking the plugin author to augment LocaleNamespaceMap.
4. Inspect the current repository, package manifest, DSHX config, Host and Client entries, installed DSH version, compatibility diagnostics, and existing tests before choosing a design. Use pnpm, preserve unrelated work, keep DSHX runtime-thin, and use the installed official DSH contracts as the source of truth.
5. Implement the requested behavior. Run the project's offline \`pnpm check\` first. Then run \`pnpm exec dshx check --runtime\` and a real DSH load/smoke against the installed verified DSH version when the runtime is available. Clearly distinguish static/type/build checks from real DSH verification; never report the offline check as runtime proof.

If I have not provided the concrete plugin behavior yet, ask me one concise question after completing the setup checks. Do not publish, push, or deploy unless I explicitly ask.`,
  zh: `我要你在当前工作区使用 DSHX 开发或修改一个 DeepSeek Harness 插件。不要猜测 API，也不要在加载开发指引前开始写代码。

1. 检查是否已经安装 \`${DSHX_DEVELOPMENT_SKILL}\` Skill；如果没有，运行：
   \`${DSHX_DEVELOPMENT_SKILL_INSTALL}\`
2. 加载并遵循 \`$${DSHX_DEVELOPMENT_SKILL}\`，包括其中的开发流程和与本需求相关的 API map。如果当前 Agent 无法在本次会话加载刚安装的 Skill，直接读取 ${DSHX_DEVELOPMENT_SKILL_URL} 及其引用文件并继续。
3. 读取 https://dshx.io/zh/docs 下与任务相关的最新 API 章节。Host、Client、defineLocale、API、Settings、Prompt 和 Slot 是 API Candidate；Conversation、Vite 兼容层和程序化 Tooling 仍是 Experimental。插件自有 zh/en 文案使用 defineLocale，不要求插件开发者扩展 LocaleNamespaceMap。
4. 选择设计前，检查当前仓库、package manifest、DSHX config、Host/Client 入口、已安装 DSH 版本、兼容性诊断和现有测试。使用 pnpm，保留无关改动，保持 DSHX runtime-thin，并以已安装的官方 DSH contract 为事实来源。
5. 实现需求。先执行项目的离线 \`pnpm check\`，再执行 \`pnpm exec dshx check --runtime\`；Runtime 可用时，还要针对已安装的已验证 DSH 版本运行真实加载/smoke。明确区分静态、类型、构建验证与真实 DSH 验证，不得把离线 check 当作 Runtime 证据。

如果我还没有说明具体插件需求，完成上述准备检查后只问我一个简短问题。除非我明确要求，不要发布、push 或部署。`,
};

export function getDshxDeveloperPrompt(locale: Locale): string {
  return prompts[locale];
}
