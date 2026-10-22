CREATE TABLE `plugin_readiness` (
	`plugin_id` text PRIMARY KEY NOT NULL,
	`install_ready` integer DEFAULT 0 NOT NULL,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
