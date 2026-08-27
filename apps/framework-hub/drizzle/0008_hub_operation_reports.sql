CREATE TABLE `hub_operation_reports` (
	`run_id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer NOT NULL,
	`outcome` text NOT NULL,
	`body_en` text NOT NULL,
	`body_zh` text NOT NULL,
	`payload_hash` text NOT NULL,
	`actor_token_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hub_operation_reports_completed_idx` ON `hub_operation_reports` (`completed_at`,`run_id`);
--> statement-breakpoint
UPDATE `plugin_operational_state`
SET `state`=CASE
	WHEN `state`='confirmed' THEN 'published'
	WHEN `state`='candidate' THEN 'draft'
	ELSE `state`
END;
--> statement-breakpoint
UPDATE `plugins` SET `badge`='community' WHERE `badge`='verified';
--> statement-breakpoint
CREATE TRIGGER `hub_operation_reports_no_update`
BEFORE UPDATE ON `hub_operation_reports`
BEGIN
	SELECT RAISE(ABORT, 'hub_operation_reports are immutable');
END;
