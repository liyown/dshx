CREATE TABLE `agent_resources` (
	`key` text PRIMARY KEY NOT NULL,
	`iv` text NOT NULL,
	`ciphertext` text NOT NULL,
	`updated_by_user_id` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "agent_resources_key_check" CHECK(length("agent_resources"."key") between 1 and 64),
	CONSTRAINT "agent_resources_value_check" CHECK(length("agent_resources"."ciphertext") > 0)
);
