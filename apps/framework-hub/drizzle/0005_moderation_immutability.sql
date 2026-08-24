CREATE TRIGGER `moderation_actions_no_update`
BEFORE UPDATE ON `moderation_actions`
BEGIN
  SELECT RAISE(ABORT, 'moderation_actions is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `moderation_actions_no_delete`
BEFORE DELETE ON `moderation_actions`
BEGIN
  SELECT RAISE(ABORT, 'moderation_actions is append-only');
END;
