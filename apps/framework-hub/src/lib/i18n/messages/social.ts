/** social card */

const en = {
  "social.noInstallTarget": "No verified install target",
  "social.frameworkLabel": "PLUGIN FRAMEWORK",
  "social.recordLabel": "PLUGIN RECORD",
  "social.officialBadge": "OFFICIAL PLUGIN",
  "social.communityBadge": "COMMUNITY PLUGIN",
} as const;

const zh: Record<keyof typeof en, string> = {
  "social.noInstallTarget": "暂无已验证安装目标",
  "social.frameworkLabel": "插件框架",
  "social.recordLabel": "插件档案",
  "social.officialBadge": "官方插件",
  "social.communityBadge": "社区插件",
};

export const socialMessages = { en, zh };
