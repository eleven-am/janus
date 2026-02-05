CREATE TABLE `link_code` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`client_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `link_code_code_unique` ON `link_code` (`code`);--> statement-breakpoint
CREATE INDEX `link_code_code_idx` ON `link_code` (`code`);--> statement-breakpoint
CREATE INDEX `link_code_userId_idx` ON `link_code` (`user_id`);--> statement-breakpoint
CREATE INDEX `hu_client_userId_idx` ON `hu_client` (`user_id`);