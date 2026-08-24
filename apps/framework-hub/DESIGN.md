# DSHX Hub design system

## Thesis

DSHX Hub is an editorial marketplace wrapped around a technical product. The public site should feel like warm paper with precise developer-tool details: generous type, quiet hairlines, compact monospaced facts, and one violet accent. Dark surfaces are reserved for code, install commands, terminals, and immutable machine evidence.

The approval center is the stricter expression of the same system: a quiet evidence ledger where irreversible decisions feel deliberate, never casual.

## Principles

1. **Lead with identity and evidence.** A page starts with one clear title and useful context; supporting metadata follows in disciplined rows.
2. **Prefer editorial rhythm over dashboard density.** Use whitespace, rules, and type hierarchy before adding containers.
3. **Keep technical facts visibly technical.** Package names, versions, hashes, counts, policies, timestamps, and commands use the mono voice.
4. **Use accent sparingly.** Violet marks active state, focus, identity, and a small number of primary signals. It is not a general-purpose fill.
5. **Separate reading from operating.** Public pages optimize for discovery; account pages organize tasks; approval pages expose state, evidence, and consequences.
6. **Make state truthful.** Disabled controls, empty states, errors, moderation outcomes, and localization fallbacks are explicit. Do not imply an action is available when its prerequisite is missing.

## Typography

- **Sans and display:** `Inter Tight`, weights 400, 500, and 600. It carries navigation, body copy, headings, and controls.
- **Mono:** `JetBrains Mono`, weights 400 and 500. It carries commands, package scopes, versions, metrics, hashes, state labels, timestamps, and section indices.
- **Primary page titles:** `clamp(2.25rem, 6vw, 4rem)` on public profile-like pages; marketplace titles top out around `3.25rem`; approval titles use `2.25rem` / `text-4xl`.
- **Section headings:** usually medium weight with tight negative tracking and balanced wrapping.
- **Body copy:** normally `14–15px`, with relaxed `1.6–1.75` line height and muted color.
- **Labels:** uppercase mono at roughly `10–12px` with `0.10–0.16em` tracking. Labels support hierarchy; they do not replace headings.

Avoid heavy bold blocks, all-caps body copy, or large type repeated at every hierarchy level.

## Color and tokens

All component colors come from the semantic variables in `src/styles.css`; do not hardcode colors in components.

| Token family | Intended use |
| --- | --- |
| `background`, `surface`, `surface-2` | Warm editorial canvas, raised reading surface, and quiet hover/selected fill |
| `foreground`, `muted-foreground` | Primary copy and secondary explanation or metadata |
| `border`, `border-strong`, `input` | Hairlines, grouped rows, field boundaries, and stronger interactive edges |
| `primary` | Main action and high-contrast control |
| `accent`, `accent-soft`, `ring` | DSHX violet identity, active state, focus, and selected filters |
| `ink`, `ink-foreground`, `ink-muted`, `ink-border`, `ink-accent` | Code, command, terminal, and machine-evidence surfaces |
| `ok`, `warn`, `destructive` | Success/verified, pending/caution, and destructive/error state |

The default palette is a near-white warm background, near-black violet-tinted text, and an indigo-violet accent. Dark mode remaps the semantic tokens; components must not bypass them. Status color is always paired with text, iconography, or a named badge.

## Geometry, spacing, and layout

- The public content container is `1180px` maximum with `24px` horizontal padding, increasing to `40px` from the medium breakpoint.
- Public page sections normally use `64–96px` vertical padding; the footer is separated by a large `128px` margin and a single top rule.
- Rounded geometry is restrained: `10px` controls, `12–14px` content surfaces, and small `6px` chips. Full pills are reserved for dots or round avatars.
- Prefer border-separated lists and definition rows over stacks of floating cards.
- Public detail pages use a reading column plus a `260px` facts rail at large sizes.
- Account pages use a `210px` navigation rail plus one flexible work area; the rail becomes horizontally scrollable on smaller screens.
- Approval detail uses a wide evidence column and a narrow decision/audit column. The decision column is subordinate to the evidence, never the reverse.

## Core patterns

### Brand and navigation

- The wordmark combines the DSHX text lockup with the X motif and a single accent underline.
- The global navigation is a `56px` sticky bar. It is transparent at the top and gains a hairline plus lightly blurred background after scrolling.
- Desktop navigation is compact and text-led. Mobile navigation collapses into a simple two-line menu button and a vertical list; session and language actions move into that menu.
- The footer groups product, community, and legal links without promotional panels.

### Section framing

- `SectionLabel` pairs a mono index, uppercase label, and horizontal hairline.
- `SectionHeading` is balanced, tightly tracked, medium weight, and capped at a readable width.
- `Lede` stays muted and no wider than the main reading measure.

### Marketplace surfaces

- Plugin cards are modest bordered surfaces with a glyph, identity, badge, short summary, and one metadata footer.
- Plugin rows preserve the same content hierarchy for denser browsing; secondary facts hide at narrow widths.
- Search is one full-width bordered field. Categories are small chips. Sort modes use text tabs with a one-pixel accent underline.
- Empty results and publishing guidance use copy plus borders, not illustrations or decorative cards.
- Plugin detail gives the install command a dark technical surface and keeps versions, dependencies, media, and reviews in a simple tabbed reading area.

### Public community pages

- User, publisher, and collection pages share `PublicPageHeader`: mono eyebrow, large identity title, optional description, and optional circular avatar.
- Contribution counts use large mono numbers above quiet labels.
- Claimed plugins, bookmarks, collections, and published plugins are rule-separated lists.
- Community writes use standard dialogs with a descriptive header, labeled fields, Turnstile state, an explicit cancel/close action, and one primary action.

### Account pages

- `AccountShell` owns the stable section navigation, page title, intro, and work area.
- Forms are linear and label-first. Success/error messages remain close to the action that produced them.
- Loading, signed-out, and empty states occupy the same bordered list area so page geometry does not jump between states.
- Destructive account actions require a confirmation dialog and explanatory consequence text.

### Controls and feedback

- Primary controls use the dark `primary` fill; secondary choices use borders, ghost treatment, or `surface-2`.
- Chips and status badges are compact, monospaced, and semantic.
- Selected tabs and filters use an underline or soft accent surface, not a large saturated block.
- Destructive actions and failed effects use the destructive token and explicit language.
- Loading copy uses an ellipsis character; async actions expose pending text such as `Recording…`.

## Motion and responsive behavior

- Motion supports orientation and continuity; it is never required to understand or complete a task.
- Public routes may use the fixed ambient motion layer: a lazy-loaded pixel field, a soft moving focus glow, and a thin scroll-progress rail with section markers.
- The pixel field is mounted only after hydration, only at `min-width: 768px`, and not when reduced motion is requested. The scroll rail is hidden below `640px`.
- Hero entrances are short, staggered, and use an ease-out curve. Hover transitions are generally `150–220ms`; the X mark may rotate as a small brand flourish.
- `prefers-reduced-motion: reduce` removes ambient stages, focus movement, hero animation, and nonessential transitions.
- Responsive layouts collapse to one reading column. Wide tables and metadata gracefully hide or become scrollable; actions wrap instead of forcing horizontal overflow.
- The admin approval center deliberately omits the public ambient layer, global navigation, and footer.

## Accessibility

- Keep native headings, lists, tables, forms, links, buttons, `details`, and definition lists wherever their semantics match the content.
- Every icon-only control has an accessible label; decorative icons and the ambient layer are `aria-hidden`.
- Visible labels bind to fields. Required reasons are described in the confirmation dialog and enforced before submission.
- Focus indication uses the semantic ring/accent token and must remain visible on both light and ink surfaces.
- Color is not the only state indicator: badges contain state text, failures include language and icons, and selected controls have structural changes.
- Maintain readable contrast for muted text, technical surfaces, disabled controls, and status tints.
- Dialogs trap focus through the shared primitives. Confirmation copy must name both the action and consequence.
- Do not auto-play consequential motion, hide required evidence behind hover, or make touch targets depend on precision pointing.

## Approval ledger rules

Direction seed: `approval-ledger`.

The approval story is: **queue health → risk and effect → immutable evidence → explicit decision → execution audit**.

- The first viewport contains the queue title, pending count, restrained filters, and the oldest critical decisions.
- The queue is a flat ledger table, not a dashboard card wall. Rows show request identity, risk, request state, effect state, and expiry before asking the administrator to open anything.
- The detail page establishes risk and status first, then shows the immutable proposed effect, evidence snapshot, preconditions, version history, decision controls, attempts, decisions, and events.
- Effect parameters are read-only. JSON is displayed on the `ink` surface; human-readable previews are numbered rule-separated rows.
- Approve, reject, request-evidence, and retry always open explicit confirmation dialogs. Rejection and requests for evidence require a reason; approval notes are optional.
- A failed effect remains visible and can only be retried through the dedicated confirmation path. Never present an automatic retry loop.
- Empty queue copy explains that deterministic operations continue automatically and that only unresolved high-risk work appears here.
- Admin routes use their own restrained header, are `noindex,nofollow`, and do not imitate the public marketplace shell.

## Anti-patterns

- No dashboard wall of interchangeable cards.
- No gradient-filled marketing panels, glassmorphism stacks, or decorative widgets competing with content.
- No hardcoded component colors, arbitrary radii, or one-off typefaces.
- No drawer for an approval decision or ordinary form; use a focused modal/dialog.
- No permanent action hidden behind an unlabeled icon, inline link, or optimistic state change.
- No editable approval effect payload, arbitrary command/webhook field, or visual shortcut around evidence and preconditions.
- No fake metrics, filters, availability, loading success, or signed-in affordances.
- No ambient canvas on mobile, in reduced-motion mode, or in the admin approval center.
- No user-generated content in SEO title/description surfaces.
- No `Changelog` navigation or page. Version history belongs to each plugin's release view.
