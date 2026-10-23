/** about */

const en = {
  "about.title": "About DSHX",
  "about.description":
    "DSHX is an open-source DeepSeek Harness plugin marketplace and the build-time TypeScript, React, and Vite toolchain behind it. Official DeepSeek Harness and Cordis services retain runtime ownership.",
  "about.eyebrow": "Open-source marketplace & framework",
  "about.boundary": "Framework boundary",
  "about.boundaryBody":
    "DSHX provides typed authoring helpers, bounded builds, diagnostics, templates, Profile-aware development, and the DSHX Hub. It does not replace the official Agent, Session, Tool, Slot, transport, persistence, HMR, or disposal runtime.",
  "about.evidence": "Verifiable sources",
  "about.evidenceBody":
    "Source code, issues, releases, compatibility declarations, tests, and contribution history are public on GitHub. Published packages carry canonical repository and license metadata on npm.",
  "about.fact.license": "License",
  "about.fact.language": "Primary language",
  "about.fact.runtime": "Runtime",
  "about.fact.package": "Package",
  "about.fact.verified": "Last verified",
} as const;

const zh: Record<keyof typeof en, string> = {
  "about.title": "关于 DSHX",
  "about.description":
    "DSHX 是开源的 DeepSeek Harness 插件市场，也是开发这些插件所用的构建期 TypeScript、React 与 Vite 工具链；Runtime 仍由官方 DeepSeek Harness 与 Cordis 服务负责。",
  "about.eyebrow": "开源市场与框架",
  "about.boundary": "框架边界",
  "about.boundaryBody":
    "DSHX 提供类型化开发辅助、受约束的构建、诊断、模板、Profile 感知开发流程和 DSHX Hub。它不会替代官方 Agent、Session、Tool、Slot、Transport、持久化、HMR 或 Dispose Runtime。",
  "about.evidence": "可验证来源",
  "about.evidenceBody":
    "源码、Issue、Release、兼容性声明、测试和贡献记录公开保存在 GitHub；发布到 npm 的包使用规范仓库与许可证元数据。",
  "about.fact.license": "许可证",
  "about.fact.language": "主要语言",
  "about.fact.runtime": "Runtime",
  "about.fact.package": "包",
  "about.fact.verified": "最后验证",
};

export const aboutMessages = { en, zh };
