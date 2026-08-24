ALTER TABLE `user` ADD `github_id` text;--> statement-breakpoint
ALTER TABLE `user` ADD `github_login` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_github_id_idx` ON `user` (`github_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_github_login_idx` ON `user` (`github_login`);