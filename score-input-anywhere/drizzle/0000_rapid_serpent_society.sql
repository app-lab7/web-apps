CREATE TABLE `averages` (
	`id` text PRIMARY KEY NOT NULL,
	`campus_id` text NOT NULL,
	`test_id` text NOT NULL,
	`grade` text NOT NULL,
	`school` text NOT NULL,
	`values_json` text NOT NULL,
	FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`test_id`) REFERENCES `tests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `averages_lookup` ON `averages` (`campus_id`,`test_id`,`grade`,`school`);--> statement-breakpoint
CREATE TABLE `campuses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `campuses_owner` ON `campuses` (`owner`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`campus_id` text NOT NULL,
	`student_id` text NOT NULL,
	`test_id` text NOT NULL,
	`grade` text NOT NULL,
	`school` text NOT NULL,
	`scores_json` text NOT NULL,
	`averages_json` text NOT NULL,
	`rank` integer,
	`collect` text NOT NULL,
	`memo` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`test_id`) REFERENCES `tests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_lookup` ON `records` (`campus_id`,`student_id`,`test_id`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`campus_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`grade` text NOT NULL,
	`school` text NOT NULL,
	`status` text DEFAULT '在籍' NOT NULL,
	`start_year` integer NOT NULL,
	FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_campus_code` ON `students` (`campus_id`,`code`);--> statement-breakpoint
CREATE TABLE `tests` (
	`id` text PRIMARY KEY NOT NULL,
	`campus_id` text NOT NULL,
	`year` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`campus_id`) REFERENCES `campuses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tests_campus_year_name` ON `tests` (`campus_id`,`year`,`name`);