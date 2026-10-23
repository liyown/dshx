/**
 * The one key space.
 *
 * Each table owns one surface's words and is written the same way, so a
 * missing translation is a type error there rather than a blank line in
 * production. A document — a chapter, a legal text, an article — keeps its own
 * prose with the document; its chrome lives here.
 */

import { aboutMessages } from "./about";
import { authMessages } from "./auth";
import { blogMessages } from "./blog";
import { capabilitiesMessages } from "./capabilities";
import { catalogMessages } from "./catalog";
import { changelogMessages } from "./changelog";
import { commonMessages } from "./common";
import { docsMessages } from "./docs";
import { emailMessages } from "./email";
import { featuredMessages } from "./featured";
import { profileMessages } from "./profiles";
import { socialMessages } from "./social";

export const locales = ["en", "zh"] as const;

export type Locale = (typeof locales)[number];

const en = {
  ...commonMessages.en,
  ...blogMessages.en,
  ...changelogMessages.en,
  ...featuredMessages.en,
  ...aboutMessages.en,
  ...authMessages.en,
  ...capabilitiesMessages.en,
  ...catalogMessages.en,
  ...docsMessages.en,
  ...emailMessages.en,
  ...profileMessages.en,
  ...socialMessages.en,
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
    ...authMessages.zh,
    ...capabilitiesMessages.zh,
    ...catalogMessages.zh,
    ...docsMessages.zh,
    ...emailMessages.zh,
    ...profileMessages.zh,
    ...socialMessages.zh,
  },
};
