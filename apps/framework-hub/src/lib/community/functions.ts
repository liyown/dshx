import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDatabase } from "@/lib/db/client";
import { getCollection, getPublicPublisher, getPublicUser } from "./marketplace.server";

export type PublicPluginData = {
  slug: string;
  name: string;
  description: string;
  package_name: string;
  latest_version?: string;
  badge?: string;
  github_stars?: number;
};

export type PublicUserData = {
  id: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  role: string;
  joinedAt: number;
  plugins: PublicPluginData[];
  collections: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    updated_at: number;
    plugin_count: number;
  }>;
  bookmarks: PublicPluginData[];
  contributions: { reviews: number; replies: number; maintained_plugins: number };
};

export type PublicPublisherData = {
  publisher: {
    id: string;
    login: string;
    kind: string;
    avatar_url: string | null;
    localized_name: string;
    localized_bio: string | null;
    seo_title: string | null;
    seo_description: string | null;
    localization_status: string | null;
  };
  plugins: PublicPluginData[];
};

export type PublicCollectionData = {
  collection: {
    id: string;
    user_id: string;
    slug: string;
    name: string;
    description: string | null;
    visibility: string;
    owner_login: string;
    owner_name: string;
  };
  plugins: PublicPluginData[];
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Community view model source must be an object");
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | undefined {
  return value == null ? undefined : String(value);
}

function nullableText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pluginView(value: unknown): PublicPluginData {
  const row = record(value);
  const latestVersion = optionalText(row["latest_version"]);
  const badge = optionalText(row["badge"]);
  return {
    slug: text(row["slug"]),
    name: text(row["name"]),
    description: text(row["description"]),
    package_name: text(row["package_name"]),
    ...(latestVersion ? { latest_version: latestVersion } : {}),
    ...(badge ? { badge } : {}),
    ...(row["github_stars"] == null ? {} : { github_stars: count(row["github_stars"]) }),
  };
}

function publicUserView(value: unknown): PublicUserData {
  const source = record(value);
  const contributions = record(source["contributions"]);
  return {
    id: text(source["id"]),
    login: text(source["login"]),
    displayName: text(source["displayName"]),
    avatarUrl: nullableText(source["avatarUrl"]),
    bio: nullableText(source["bio"]),
    role: text(source["role"]),
    joinedAt: count(source["joinedAt"]),
    plugins: Array.isArray(source["plugins"]) ? source["plugins"].map(pluginView) : [],
    collections: Array.isArray(source["collections"])
      ? source["collections"].map((value) => {
          const row = record(value);
          return {
            id: text(row["id"]),
            slug: text(row["slug"]),
            name: text(row["name"]),
            description: nullableText(row["description"]),
            updated_at: count(row["updated_at"]),
            plugin_count: count(row["plugin_count"]),
          };
        })
      : [],
    bookmarks: Array.isArray(source["bookmarks"]) ? source["bookmarks"].map(pluginView) : [],
    contributions: {
      reviews: count(contributions["reviews"]),
      replies: count(contributions["replies"]),
      maintained_plugins: count(contributions["maintained_plugins"]),
    },
  };
}

function publicPublisherView(value: unknown): PublicPublisherData {
  const source = record(value);
  const publisher = record(source["publisher"]);
  return {
    publisher: {
      id: text(publisher["id"]),
      login: text(publisher["login"]),
      kind: text(publisher["kind"]),
      avatar_url: nullableText(publisher["avatar_url"]),
      localized_name: text(publisher["localized_name"]),
      localized_bio: nullableText(publisher["localized_bio"]),
      seo_title: nullableText(publisher["seo_title"]),
      seo_description: nullableText(publisher["seo_description"]),
      localization_status: nullableText(publisher["localization_status"]),
    },
    plugins: Array.isArray(source["plugins"]) ? source["plugins"].map(pluginView) : [],
  };
}

function publicCollectionView(value: unknown): PublicCollectionData {
  const source = record(value);
  const collection = record(source["collection"]);
  return {
    collection: {
      id: text(collection["id"]),
      user_id: text(collection["user_id"]),
      slug: text(collection["slug"]),
      name: text(collection["name"]),
      description: nullableText(collection["description"]),
      visibility: text(collection["visibility"]),
      owner_login: text(collection["owner_login"]),
      owner_name: text(collection["owner_name"]),
    },
    plugins: Array.isArray(source["plugins"]) ? source["plugins"].map(pluginView) : [],
  };
}

const loginInput = z.object({ login: z.string().min(1).max(128) });
const publisherInput = loginInput.extend({ locale: z.enum(["en", "zh"]) });
const collectionInput = z.object({ id: z.string().uuid() });

export const loadPublicUser = createServerFn({ method: "GET" })
  .validator(loginInput)
  .handler(async ({ data, context }) =>
    publicUserView(await getPublicUser(requireDatabase(context), data.login)),
  );

export const loadPublicPublisher = createServerFn({ method: "GET" })
  .validator(publisherInput)
  .handler(async ({ data, context }) =>
    publicPublisherView(
      await getPublicPublisher(requireDatabase(context), data.login, data.locale),
    ),
  );

export const loadPublicCollection = createServerFn({ method: "GET" })
  .validator(collectionInput)
  .handler(async ({ data, context }) =>
    publicCollectionView(await getCollection(requireDatabase(context), data.id)),
  );
