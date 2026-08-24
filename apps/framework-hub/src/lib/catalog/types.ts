export type CatalogCard = {
  slug: string;
  name: string;
  scope: string;
  description: string;
  author: string;
  version: string;
  compat: string;
  updated: string;
  category: string;
  stars: number;
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
