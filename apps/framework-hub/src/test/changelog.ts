import { createChangelogSchema } from "@/lib/changelog.contracts";
import type { ChangelogEntry } from "@/lib/changelog";

export function changelogInput(slug = "test-changelog-entry") {
  return createChangelogSchema.parse({
    slug,
    version: "1.0.0",
    product: "Hub",
    channel: "release",
    status: "draft",
    publishedAt: "2026-08-22",
    content: {
      en: {
        title: "A database update",
        description: "Release notes stored in D1.",
        sections: [
          {
            id: "changes",
            title: "Changes",
            paragraphs: ["This content is stored in the database."],
          },
        ],
        links: [],
      },
      zh: {
        title: "数据库更新",
        description: "存储于 D1 的更新日志。",
        sections: [{ id: "changes", title: "本次变化", paragraphs: ["这段正文来自数据库。"] }],
        links: [],
      },
    },
  });
}

export function changelogSummary(): ChangelogEntry {
  const { content, ...fields } = changelogInput();
  return {
    ...fields,
    revision: 1,
    updatedAt: "2026-08-22T00:00:00.000Z",
    copy: {
      en: { title: content.en.title, description: content.en.description },
      zh: { title: content.zh.title, description: content.zh.description },
    },
  };
}
