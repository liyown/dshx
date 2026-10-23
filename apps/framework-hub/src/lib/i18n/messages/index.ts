/**
 * The one key space.
 *
 * A locale owns three things that used to live apart: the UI strings in
 * `common`, and the copy for the editorial surfaces — blog, changelog,
 * featured shelves, about. Each table is written the same way, so a missing
 * translation is a type error here rather than a blank line in production.
 */

import { aboutMessages } from "./about";
import { blogMessages } from "./blog";
import { changelogMessages } from "./changelog";
import { commonMessages } from "./common";
import { featuredMessages } from "./featured";

export const locales = ["en", "zh"] as const;

export type Locale = (typeof locales)[number];

const en = {
  ...commonMessages.en,
  ...blogMessages.en,
  ...changelogMessages.en,
  ...featuredMessages.en,
  ...aboutMessages.en,
} as const;

export type MessageKey = keyof typeof en;

export const messages: Record<Locale, Record<MessageKey, string>> = {
  en,
  zh: {
    ...commonMessages.zh,
    ...blogMessages.zh,
    ...changelogMessages.zh,
    ...featuredMessages.zh,
    ...aboutMessages.zh,
  },
};
