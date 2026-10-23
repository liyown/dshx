/** profile */

const en = {
  "profile.maintained": "Maintained",
  "profile.reviews": "Reviews",
  "profile.replies": "Replies",
  "profile.claimedPlugins": "Claimed plugins",
  "profile.claimedPluginsEmpty": "No public claimed plugins yet.",
  "profile.publicBookmarks": "Public bookmarks",
  "profile.publicBookmarksEmpty": "No public bookmarks yet.",
  "profile.publicCollections": "Public collections",
  "profile.collectionPluginCount": "{count} plugins",
  "profile.publishedPlugins": "Published plugins",
  "profile.publishedPluginsEmpty": "No public plugins yet.",
} as const;

const zh: Record<keyof typeof en, string> = {
  "profile.maintained": "维护插件",
  "profile.reviews": "评价",
  "profile.replies": "回复",
  "profile.claimedPlugins": "已认领插件",
  "profile.claimedPluginsEmpty": "尚未认领公开插件。",
  "profile.publicBookmarks": "公开收藏",
  "profile.publicBookmarksEmpty": "尚无公开收藏。",
  "profile.publicCollections": "公开收藏夹",
  "profile.collectionPluginCount": "{count} 个插件",
  "profile.publishedPlugins": "发布的插件",
  "profile.publishedPluginsEmpty": "暂无公开插件。",
};

export const profileMessages = { en, zh };
