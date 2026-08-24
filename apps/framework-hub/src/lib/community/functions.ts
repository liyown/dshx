import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireD1 } from "@/lib/db/client";
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

function serializable<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const loginInput = z.object({ login: z.string().min(1).max(128) });
const publisherInput = loginInput.extend({ locale: z.enum(["en", "zh"]) });
const collectionInput = z.object({ id: z.string().uuid() });

export const loadPublicUser = createServerFn({ method: "GET" })
  .validator(loginInput)
  .handler(async ({ data, context }) =>
    serializable<PublicUserData>(await getPublicUser(requireD1(context), data.login)),
  );

export const loadPublicPublisher = createServerFn({ method: "GET" })
  .validator(publisherInput)
  .handler(async ({ data, context }) =>
    serializable<PublicPublisherData>(
      await getPublicPublisher(requireD1(context), data.login, data.locale),
    ),
  );

export const loadPublicCollection = createServerFn({ method: "GET" })
  .validator(collectionInput)
  .handler(async ({ data, context }) =>
    serializable<PublicCollectionData>(await getCollection(requireD1(context), data.id)),
  );
