import { createFileRoute, notFound } from "@tanstack/react-router";

import { Container, SectionLabel } from "@/components/dshx/primitives";
import { parseLocale } from "@/lib/i18n";

const documents = {
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
      intro: "A concise standard for useful marketplace participation.",
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
      intro: "帮助市场保持有用与可信的简明规则。",
      sections: [
        ["提供具体信息", "评价实际使用过的插件，说明环境，并把观察到的事实与猜测区分开。"],
        ["尊重边界", "禁止威胁、仇恨、骚扰、泄露隐私、冒充他人和反复发送未经请求的推广。"],
        ["申诉", "与你的内容或账号相关的审核动作可以申诉；任何处罚推翻都必须经过审批中心。"],
      ],
    },
  },
} as const;

export const Route = createFileRoute("/$locale/legal/$document")({
  loader: ({ params }) => {
    const document = documents[params.document as keyof typeof documents];
    if (!document) throw notFound();
    return document[parseLocale(params.locale)];
  },
  head: ({ loaderData, params }) => ({
    meta: [
      { title: `${loaderData?.title ?? "Policy"} · DSHX Hub` },
      { name: "description", content: loaderData?.intro ?? "DSHX Hub policy" },
    ],
    links: [
      { rel: "canonical", href: `https://dshx.io/${params.locale}/legal/${params.document}` },
    ],
  }),
  component: LegalPage,
});

function LegalPage() {
  const document = Route.useLoaderData();
  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="policy">DSHX Hub</SectionLabel>
        <h1 className="mt-6 text-[clamp(2.25rem,6vw,4rem)] font-medium leading-none tracking-[-0.045em]">
          {document.title}
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-7 text-muted-foreground">
          {document.intro}
        </p>
        <div className="mt-12 max-w-3xl divide-y divide-border border-y border-border">
          {document.sections.map(([title, body]) => (
            <section key={title} className="grid gap-3 py-7 sm:grid-cols-[180px_1fr]">
              <h2 className="font-medium">{title}</h2>
              <p className="text-sm leading-7 text-muted-foreground">{body}</p>
            </section>
          ))}
        </div>
        <p className="mt-8 font-mono text-xs text-muted-foreground">
          Effective 2026-08-24 · contact security@dshx.io
        </p>
      </Container>
    </main>
  );
}
