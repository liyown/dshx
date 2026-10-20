CREATE TABLE `blog_post_plugins` (
	`blog_post_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`blog_post_id`, `plugin_id`),
	FOREIGN KEY (`blog_post_id`) REFERENCES `blog_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `blog_post_plugins_plugin_idx` ON `blog_post_plugins` (`plugin_id`);--> statement-breakpoint
CREATE TABLE `blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text NOT NULL,
	`cover_image_url` text,
	`content_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by_token_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "blog_status_check" CHECK("blog_posts"."status" in ('draft','published')),
	CONSTRAINT "blog_revision_check" CHECK("blog_posts"."revision" > 0),
	CONSTRAINT "blog_content_check" CHECK(json_valid("blog_posts"."content_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_slug_unique` ON `blog_posts` (`slug`);--> statement-breakpoint
CREATE INDEX `blog_publication_idx` ON `blog_posts` (`status`,`published_at`,`slug`);--> statement-breakpoint
CREATE TABLE `featured_plugin_picks` (
	`category_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`category_id`, `plugin_id`),
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `featured_plugin_picks_order_idx` ON `featured_plugin_picks` (`category_id`,`sort_order`);--> statement-breakpoint
-- Initial editorial shelves: keep the strongest four published plugins in
-- every active category. Operators can replace these picks through the Hub
-- operations API. Existing rows are preserved on re-apply.
insert or ignore into featured_plugin_picks(category_id, plugin_id, sort_order)
select ranked.category_id, ranked.plugin_id, ranked.pick_position - 1
from (
  select pc.category_id, p.id as plugin_id,
    row_number() over (
      partition by pc.category_id
      order by coalesce(m.github_stars, 0) + coalesce(m.npm_downloads_week, 0) * 20 desc,
        p.updated_at desc, p.slug
    ) as pick_position
  from plugins p
  join plugin_categories pc on pc.plugin_id = p.id
  join categories c on c.id = pc.category_id and c.active = 1
  left join plugin_metrics_current m on m.plugin_id = p.id
  where p.status = 'published'
    and p.lifecycle_status in ('active', 'unmaintained')
) ranked
where ranked.pick_position <= 4;
