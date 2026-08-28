export const aboutCopy = {
  en: {
    title: "About DSHX",
    description:
      "DSHX is an open-source, build-time TypeScript, React, and Vite toolchain for DeepSeek Harness plugins. Official DSH and Cordis services retain runtime ownership.",
    eyebrow: "Open-source framework",
    boundary: "Framework boundary",
    boundaryBody:
      "DSHX provides typed authoring helpers, bounded builds, diagnostics, templates, Profile-aware development, and the DSHX Hub. It does not replace the official Agent, Session, Tool, Slot, transport, persistence, HMR, or disposal runtime.",
    evidence: "Verifiable sources",
    evidenceBody:
      "Source code, issues, releases, compatibility declarations, tests, and contribution history are public on GitHub. Published packages carry canonical repository and license metadata on npm.",
    facts: [
      ["License", "MIT"],
      ["Primary language", "TypeScript"],
      ["Runtime", "DeepSeek Harness / Cordis"],
      ["Package", "@becomeopc/dshx"],
      ["Last verified", "2026-08-28"],
    ],
  },
  zh: {
    title: "关于 DSHX",
    description:
      "DSHX 是面向 DeepSeek Harness 插件的开源构建期 TypeScript、React 与 Vite 工具链；Runtime 仍由官方 DSH 与 Cordis 服务负责。",
    eyebrow: "开源框架",
    boundary: "框架边界",
    boundaryBody:
      "DSHX 提供类型化开发辅助、受约束的构建、诊断、模板、Profile 感知开发流程和 DSHX Hub。它不会替代官方 Agent、Session、Tool、Slot、Transport、持久化、HMR 或 Dispose Runtime。",
    evidence: "可验证来源",
    evidenceBody:
      "源码、Issue、Release、兼容性声明、测试和贡献记录公开保存在 GitHub；发布到 npm 的包使用规范仓库与许可证元数据。",
    facts: [
      ["许可证", "MIT"],
      ["主要语言", "TypeScript"],
      ["Runtime", "DeepSeek Harness / Cordis"],
      ["包", "@becomeopc/dshx"],
      ["最后验证", "2026-08-28"],
    ],
  },
} as const;

export const examples = [
  {
    name: "hello-slot",
    titleKey: "examples.hello.title",
    tagKey: "examples.hello.tag",
    descriptionKey: "examples.hello.description",
    code: `defineClient({
  slots: [
    defineSlot('sidebar.footer.action', { component: Hello }),
  ],
})`,
  },
  {
    name: "search-tool",
    titleKey: "examples.search.title",
    tagKey: "examples.search.tag",
    descriptionKey: "examples.search.description",
    code: `defineHost({
  tools: [
    tool('search', { input: z.object({ q: z.string() }) }, run),
  ],
})`,
  },
  {
    name: "typed-api",
    titleKey: "examples.api.title",
    tagKey: "examples.api.tag",
    descriptionKey: "examples.api.description",
    code: `export const statusApi = defineApi({
  id: 'status',
  version: 1,
  methods: {
    get: method<{ id: string }, Status>(),
  },
})`,
  },
  {
    name: "runtime-hooks",
    titleKey: "examples.hooks.title",
    tagKey: "examples.hooks.tag",
    descriptionKey: "examples.hooks.description",
    code: `setup(ctx) {
  ctx.on('agent/pre-step', step => audit(step))
}`,
  },
] as const;

export const legalDocuments = {
  privacy: {
    en: {
      title: "Privacy policy",
      intro: "How DSHX Hub handles identity, marketplace activity and account deletion.",
      sections: [
        [
          "Data we keep",
          "GitHub identity, profile fields, marketplace relationships, community contributions, security events and immutable moderation records.",
        ],
        [
          "Public data",
          "User profiles, public bookmarks and collections, reviews, replies and claimed plugins are visible by design. Private collections and tokens are never exposed publicly.",
        ],
        [
          "Deletion",
          "Account deletion revokes sessions and tokens, removes private data, and anonymizes public contributions. Immutable approval and moderation evidence is retained for security and accountability.",
        ],
        [
          "Operational email",
          "Approval results and processing failures are sent to verified account addresses through Resend. DSHX Hub does not use this channel for marketing. You can always find the same information in your account notifications.",
        ],
      ],
    },
    zh: {
      title: "隐私政策",
      intro: "DSHX Hub 如何处理身份、市场活动与账号删除。",
      sections: [
        ["保存的数据", "GitHub 身份、个人资料、市场关系、社区内容、安全事件和不可变审核记录。"],
        [
          "公开数据",
          "用户主页、公开收藏与收藏夹、评价、回复和已认领插件按设计公开。私有收藏夹和令牌不会公开。",
        ],
        [
          "账号删除",
          "删除账号会撤销会话与令牌、移除私有数据，并匿名保留公开贡献。审批和审核证据为了安全与责任审计会永久保留。",
        ],
        [
          "操作邮件",
          "审批结果和处理失败通知会通过 Resend 发送到已验证的账号邮箱。DSHX Hub 不使用该通道发送营销邮件，你也可以随时在账号通知中查看相同信息。",
        ],
      ],
    },
  },
  terms: {
    en: {
      title: "Marketplace terms",
      intro: "Rules for publishing, using and discussing DSH plugins.",
      sections: [
        [
          "Verified is not endorsed",
          "Hub verification checks declarations, archive contents and install integrity without executing third-party scripts. It does not guarantee that a plugin is suitable for every environment.",
        ],
        [
          "Publisher responsibility",
          "Publishers must provide accurate identity, licensing, compatibility and security information and must not distribute malicious or deceptive software.",
        ],
        [
          "Community conduct",
          "Reviews and replies must be relevant and lawful. Spam, harassment, credential theft, doxxing and malware are subject to moderation.",
        ],
      ],
    },
    zh: {
      title: "市场条款",
      intro: "发布、使用和讨论 DSH 插件时应遵守的规则。",
      sections: [
        [
          "验证不等于背书",
          "Hub 在不执行第三方脚本的前提下检查声明、归档内容和安装完整性，但不保证插件适合所有环境。",
        ],
        [
          "发布者责任",
          "发布者必须准确提供身份、许可证、兼容性与安全信息，不得分发恶意或欺骗性软件。",
        ],
        [
          "社区行为",
          "评价与回复应当相关、合法。垃圾推广、骚扰、凭证盗取、开盒和恶意软件会被审核处理。",
        ],
      ],
    },
  },
  community: {
    en: {
      title: "Community policy",
      intro: "Rules for reviews, replies and other marketplace activity.",
      sections: [
        [
          "Be specific",
          "Review the plugin you used, explain the environment and separate observed facts from guesses.",
        ],
        [
          "Respect boundaries",
          "No threats, hate, harassment, private-data exposure, impersonation or repeated unsolicited promotion.",
        ],
        [
          "Appeals",
          "Moderation actions tied to your content or account can be appealed. Reversals are always reviewed through the approval center.",
        ],
      ],
    },
    zh: {
      title: "社区规范",
      intro: "评价、回复及其他市场活动的规则。",
      sections: [
        ["提供具体信息", "评价实际使用过的插件，说明环境，并把观察到的事实与猜测区分开。"],
        ["尊重边界", "禁止威胁、仇恨、骚扰、泄露隐私、冒充他人和反复发送未经请求的推广。"],
        ["申诉", "与你的内容或账号相关的审核动作可以申诉；任何处罚推翻都必须经过审批中心。"],
      ],
    },
  },
} as const;

export type LegalDocument = keyof typeof legalDocuments;

export function isLegalDocument(value: string): value is LegalDocument {
  return value in legalDocuments;
}
