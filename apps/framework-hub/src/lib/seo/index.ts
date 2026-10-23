/**
 * The page head.
 *
 * One module owns how a page announces itself: the canonical URL, its
 * alternates, Open Graph and X metadata, and the schema.org graph. Pages supply
 * their identity, their copy, and their entities; they never assemble nodes.
 */

export { buildPageHead, pageTitle, type PageHeadInput, type SchemaNode } from "./head";
export {
  aboutPage,
  article,
  breadcrumbs,
  collection,
  faqPage,
  organization,
  pluginApplication,
  profilePage,
  schemaGraph,
  sourceCode,
  webPage,
  website,
  WEBSITE_ID,
  type CollectionItem,
  type Crumb,
  type ProfileEntity,
} from "./schema";
export {
  DEFAULT_SOCIAL_IMAGE,
  localePath,
  localizedAlternates,
  localizedAlternatesForLocales,
  normalizePublicPath,
  PUBLIC_SITE_URL,
  publicUrl,
  socialCardUrl,
  type Alternates,
} from "./urls";
