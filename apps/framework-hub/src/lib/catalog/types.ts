export type CatalogCard = {
  slug: string;
  name: string;
  scope: string;
  description: string;
  author: string;
  version: string;
  compat: string;
  publishedAt: string | null;
  updated: string;
  category: string;
  stars: number | null;
  downloads: string;
  badge: "official" | "verified" | "community";
  glyph: string;
  iconUrl: string | null;
  publisher: {
    login: string;
    avatarUrl: string | null;
  };
  featured: boolean;
  trending: boolean;
  isNew: boolean;
};
